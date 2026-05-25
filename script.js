/* ====================================================
   SMARTLIST — LISTA DE COMPRAS INTELIGENTE
   ==================================================== */

(function () {
    'use strict';

    /* ============================================
       CONSTANTS
       ============================================ */
    const STORAGE_KEY = 'smartlist_products';
    const THEME_KEY = 'smartlist_theme';
    const DATE_KEY = 'smartlist_creation_date';
    const BUDGET_KEY = 'smartlist_budget';
    const HISTORY_KEY = 'smartlist_history';

    const CATEGORY_ICONS = {
        'Mercado': 'fa-cart-shopping',
        'Farmácia': 'fa-pills',
        'Padaria': 'fa-bread-slice',
        'Açougue': 'fa-drumstick-bite',
        'Hortifruti': 'fa-apple-whole',
        'Limpeza': 'fa-spray-can',
        'Higiene': 'fa-pump-soap',
        'Bebidas': 'fa-wine-bottle',
        'Congelados': 'fa-snowflake',
        'Outros': 'fa-box'
    };

    const CATEGORY_COLORS = {
        'Mercado': '#6366f1',
        'Farmácia': '#10b981',
        'Padaria': '#f59e0b',
        'Açougue': '#ef4444',
        'Hortifruti': '#22c55e',
        'Limpeza': '#06b6d4',
        'Higiene': '#ec4899',
        'Bebidas': '#8b5cf6',
        'Congelados': '#3b82f6',
        'Outros': '#64748b'
    };

    const PRIORITY_ORDER = { 'alta': 0, 'normal': 1, 'baixa': 2 };

    /* ============================================
       STATE
       ============================================ */
    let products = [];
    let nameHistory = [];
    let budget = null;
    let confirmCallback = null;
    let activeFilter = 'all';
    let selectedIds = new Set();
    let editingId = null;
    let draggedId = null;
    let recognition = null;

    /* ============================================
       DOM
       ============================================ */
    const $ = (id) => document.getElementById(id);
    const $$ = (selector) => document.querySelectorAll(selector);

    const productForm = $('productForm');
    const productNameInput = $('productName');
    const productCategorySelect = $('productCategory');
    const productQuantityInput = $('productQuantity');
    const productPriceInput = $('productPrice');
    const productPriorityInput = $('productPriority');
    const productList = $('productList');
    const emptyState = $('emptyState');
    const searchInput = $('searchInput');
    const clearSearchBtn = $('clearSearch');
    const filterCategorySelect = $('filterCategory');
    const sortOrderSelect = $('sortOrder');
    const creationDateSpan = $('creationDate');
    const suggestionsList = $('suggestionsList');

    const totalItemsEl = $('totalItems');
    const purchasedItemsEl = $('purchasedItems');
    const pendingItemsEl = $('pendingItems');
    const totalCategoriesEl = $('totalCategories');
    const visibleCountEl = $('visibleCount');
    const totalCostEl = $('totalCost');
    const progressFill = $('progressFill');
    const progressPercent = $('progressPercent');
    const progressDetail = $('progressDetail');

    const budgetSpentEl = $('budgetSpent');
    const budgetLimitEl = $('budgetLimit');
    const budgetBarFill = $('budgetBarFill');
    const budgetMessageEl = $('budgetMessage');
    const categoryChartEl = $('categoryChart');

    const toast = $('toast');
    const confirmModal = $('confirmModal');
    const editModal = $('editModal');
    const budgetModal = $('budgetModal');
    const shortcutsModal = $('shortcutsModal');

    /* ============================================
       STORAGE
       ============================================ */
    const storage = {
        load(key, fallback) {
            try {
                const data = localStorage.getItem(key);
                return data ? JSON.parse(data) : fallback;
            } catch (e) {
                return fallback;
            }
        },
        save(key, data) {
            try {
                localStorage.setItem(key, JSON.stringify(data));
            } catch (e) {
                showToast('Erro ao salvar dados.', 'error');
            }
        }
    };

    /* ============================================
       UTILS
       ============================================ */
    function generateId() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
    }

    function formatDate(dateStr) {
        const d = new Date(dateStr);
        return d.toLocaleDateString('pt-BR', {
            day: '2-digit', month: 'short', year: 'numeric'
        });
    }

    function formatCurrency(value) {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency', currency: 'BRL'
        }).format(value || 0);
    }

    function getCreationDate() {
        let date = localStorage.getItem(DATE_KEY);
        if (!date) {
            date = new Date().toISOString();
            localStorage.setItem(DATE_KEY, date);
        }
        return date;
    }

    function calcTotal(p) {
        return (p.quantity || 0) * (p.price || 0);
    }

    function pluralize(count, singular, plural) {
        return `${count} ${count === 1 ? singular : plural}`;
    }

    /* ============================================
       TOAST
       ============================================ */
    let toastTimeout = null;
    function showToast(message, type = 'success') {
        const icons = {
            success: 'fa-circle-check',
            error: 'fa-circle-xmark',
            warning: 'fa-triangle-exclamation',
            info: 'fa-circle-info'
        };
        toast.className = `toast ${type}`;
        toast.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i> ${escapeHtml(message)}`;

        requestAnimationFrame(() => toast.classList.add('show'));

        clearTimeout(toastTimeout);
        toastTimeout = setTimeout(() => toast.classList.remove('show'), 3200);
    }

    /* ============================================
       MODAL
       ============================================ */
    function openModal(modal) {
        modal.classList.add('visible');
        modal.setAttribute('aria-hidden', 'false');
    }

    function closeModal(modal) {
        modal.classList.remove('visible');
        modal.setAttribute('aria-hidden', 'true');
    }

    function openConfirm(title, message, onConfirm) {
        $('modalTitle').textContent = title;
        $('modalMessage').textContent = message;
        confirmCallback = onConfirm;
        openModal(confirmModal);
    }

    $('modalConfirm').addEventListener('click', () => {
        if (confirmCallback) confirmCallback();
        closeModal(confirmModal);
        confirmCallback = null;
    });
    $('modalCancel').addEventListener('click', () => closeModal(confirmModal));
    confirmModal.addEventListener('click', e => {
        if (e.target === confirmModal) closeModal(confirmModal);
    });

    /* ============================================
       THEME
       ============================================ */
    function loadTheme() {
        const saved = localStorage.getItem(THEME_KEY) || 'light';
        applyTheme(saved);
    }

    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        const newIcon = theme === 'dark' ? 'fa-sun' : 'fa-moon';
        $$('#themeToggle i, #themeToggleMobile i').forEach(i => {
            i.className = `fas ${newIcon}`;
        });
        localStorage.setItem(THEME_KEY, theme);
    }

    function toggleTheme() {
        const current = document.documentElement.getAttribute('data-theme') || 'light';
        applyTheme(current === 'dark' ? 'light' : 'dark');
    }

    $('themeToggle').addEventListener('click', toggleTheme);
    $('themeToggleMobile').addEventListener('click', toggleTheme);

    /* ============================================
       SIDEBAR (mobile)
       ============================================ */
    const sidebar = $('sidebar');
    const sidebarOverlay = $('sidebarOverlay');

    $('menuToggle').addEventListener('click', () => {
        sidebar.classList.add('open');
        sidebarOverlay.classList.add('visible');
    });

    sidebarOverlay.addEventListener('click', () => {
        sidebar.classList.remove('open');
        sidebarOverlay.classList.remove('visible');
    });

    /* ============================================
       CRUD
       ============================================ */
    function addProduct(data) {
        const product = {
            id: generateId(),
            name: data.name.trim(),
            category: data.category,
            quantity: parseInt(data.quantity, 10) || 1,
            price: parseFloat(data.price) || 0,
            priority: data.priority || 'normal',
            purchased: false,
            createdAt: new Date().toISOString()
        };
        products.unshift(product);
        saveProducts();
        addToHistory(product.name);
        render();
        showToast(`"${product.name}" adicionado!`, 'success');
    }

    function updateProduct(id, data) {
        const product = products.find(p => p.id === id);
        if (!product) return;
        Object.assign(product, {
            name: data.name.trim(),
            category: data.category,
            quantity: parseInt(data.quantity, 10) || 1,
            price: parseFloat(data.price) || 0,
            priority: data.priority || 'normal'
        });
        saveProducts();
        render();
        showToast('Produto atualizado!', 'success');
    }

    function togglePurchased(id) {
        const product = products.find(p => p.id === id);
        if (!product) return;
        const wasComplete = isAllPurchased();
        product.purchased = !product.purchased;
        saveProducts();
        render();

        if (!wasComplete && isAllPurchased() && products.length > 0) {
            celebrateCompletion();
        }
    }

    function isAllPurchased() {
        return products.length > 0 && products.every(p => p.purchased);
    }

    function removeProduct(id) {
        const product = products.find(p => p.id === id);
        if (!product) return;
        const itemEl = productList.querySelector(`[data-id="${id}"]`);
        if (itemEl) {
            itemEl.classList.add('removing');
            setTimeout(() => {
                products = products.filter(p => p.id !== id);
                selectedIds.delete(id);
                saveProducts();
                render();
                showToast(`"${product.name}" removido.`, 'warning');
            }, 280);
        }
    }

    function clearAll() {
        if (products.length === 0) {
            showToast('A lista já está vazia.', 'info');
            return;
        }
        openConfirm(
            'Limpar lista',
            `Deseja remover ${pluralize(products.length, 'item', 'itens')} da lista? Esta ação não pode ser desfeita.`,
            () => {
                products = [];
                selectedIds.clear();
                saveProducts();
                render();
                showToast('Lista limpa com sucesso!', 'success');
            }
        );
    }

    function saveProducts() {
        storage.save(STORAGE_KEY, products);
    }

    /* ============================================
       HISTORY (sugestões)
       ============================================ */
    function addToHistory(name) {
        const lower = name.toLowerCase();
        nameHistory = nameHistory.filter(h => h.toLowerCase() !== lower);
        nameHistory.unshift(name);
        nameHistory = nameHistory.slice(0, 30);
        storage.save(HISTORY_KEY, nameHistory);
        renderSuggestions();
    }

    function renderSuggestions() {
        suggestionsList.innerHTML = '';
        nameHistory.forEach(name => {
            const opt = document.createElement('option');
            opt.value = name;
            suggestionsList.appendChild(opt);
        });
    }

    /* ============================================
       BULK ACTIONS
       ============================================ */
    function toggleSelected(id) {
        if (selectedIds.has(id)) selectedIds.delete(id);
        else selectedIds.add(id);
        updateBulkBar();
    }

    function updateBulkBar() {
        const bar = $('bulkBar');
        const n = selectedIds.size;
        $('bulkCount').textContent = n === 0
            ? 'Nenhum selecionado'
            : pluralize(n, 'item selecionado', 'itens selecionados');
        bar.classList.toggle('visible', n > 0);

        $$('.product-item').forEach(item => {
            const isSelected = selectedIds.has(item.dataset.id);
            item.classList.toggle('selected', isSelected);

            const selectBtn = item.querySelector('[data-action="select"] i');
            if (selectBtn) {
                selectBtn.className = isSelected ? 'fas fa-square-check' : 'far fa-square';
            }
        });
    }

    function bulkMark(purchased) {
        if (selectedIds.size === 0) return;
        products.forEach(p => {
            if (selectedIds.has(p.id)) p.purchased = purchased;
        });
        saveProducts();
        selectedIds.clear();
        render();
        showToast(`Itens ${purchased ? 'marcados como comprados' : 'desmarcados'}.`, 'success');
    }

    function bulkDelete() {
        if (selectedIds.size === 0) return;
        const count = selectedIds.size;
        openConfirm(
            'Excluir selecionados',
            `Remover ${pluralize(count, 'item selecionado', 'itens selecionados')} da lista?`,
            () => {
                products = products.filter(p => !selectedIds.has(p.id));
                selectedIds.clear();
                saveProducts();
                render();
                const msg = count === 1 ? 'Item removido.' : `${count} itens removidos.`;
                showToast(msg, 'warning');
            }
        );
    }

    $('bulkMarkPurchased').addEventListener('click', () => bulkMark(true));
    $('bulkMarkPending').addEventListener('click', () => bulkMark(false));
    $('bulkDelete').addEventListener('click', bulkDelete);
    $('bulkCancel').addEventListener('click', () => {
        selectedIds.clear();
        updateBulkBar();
    });

    /* ============================================
       EDIT MODAL
       ============================================ */
    function openEdit(id) {
        const product = products.find(p => p.id === id);
        if (!product) return;

        editingId = id;

        const editCategory = $('editCategory');
        editCategory.innerHTML = '';
        Object.keys(CATEGORY_ICONS).forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat;
            opt.textContent = cat;
            editCategory.appendChild(opt);
        });

        $('editName').value = product.name;
        $('editCategory').value = product.category;
        $('editQuantity').value = product.quantity;
        $('editPrice').value = product.price || '';
        $('editPriority').value = product.priority || 'normal';

        openModal(editModal);
        setTimeout(() => $('editName').focus(), 100);
    }

    $('editForm').addEventListener('submit', e => {
        e.preventDefault();
        if (!editingId) return;
        updateProduct(editingId, {
            name: $('editName').value,
            category: $('editCategory').value,
            quantity: $('editQuantity').value,
            price: $('editPrice').value,
            priority: $('editPriority').value
        });
        closeModal(editModal);
        editingId = null;
    });

    $('editCancel').addEventListener('click', () => closeModal(editModal));
    editModal.addEventListener('click', e => {
        if (e.target === editModal) closeModal(editModal);
    });

    /* ============================================
       BUDGET
       ============================================ */
    function loadBudget() {
        budget = storage.load(BUDGET_KEY, null);
        updateBudgetUI();
    }

    function updateBudgetUI() {
        const spent = products.reduce((sum, p) => sum + calcTotal(p), 0);
        budgetSpentEl.textContent = formatCurrency(spent);

        if (budget && budget > 0) {
            budgetLimitEl.textContent = formatCurrency(budget);
            const percent = Math.min((spent / budget) * 100, 100);
            budgetBarFill.style.width = `${percent}%`;

            budgetBarFill.classList.remove('warning', 'danger');
            if (percent >= 100) {
                budgetBarFill.classList.add('danger');
                budgetMessageEl.textContent = `Excedido em ${formatCurrency(spent - budget)}`;
                budgetMessageEl.style.color = 'var(--danger)';
            } else if (percent >= 80) {
                budgetBarFill.classList.add('warning');
                budgetMessageEl.textContent = `Restam ${formatCurrency(budget - spent)} (${Math.round(percent)}% usado)`;
                budgetMessageEl.style.color = 'var(--warning)';
            } else {
                budgetMessageEl.textContent = `Restam ${formatCurrency(budget - spent)}`;
                budgetMessageEl.style.color = '';
            }
        } else {
            budgetLimitEl.textContent = '—';
            budgetBarFill.style.width = '0%';
            budgetMessageEl.textContent = 'Defina um limite para acompanhar.';
            budgetMessageEl.style.color = '';
        }
    }

    $('setBudget').addEventListener('click', () => {
        $('budgetInput').value = budget || '';
        openModal(budgetModal);
        setTimeout(() => $('budgetInput').focus(), 100);
    });

    $('budgetForm').addEventListener('submit', e => {
        e.preventDefault();
        const val = parseFloat($('budgetInput').value);
        if (val > 0) {
            budget = val;
            storage.save(BUDGET_KEY, budget);
            updateBudgetUI();
            showToast(`Orçamento de ${formatCurrency(val)} definido.`, 'success');
        }
        closeModal(budgetModal);
    });

    $('budgetClear').addEventListener('click', () => {
        budget = null;
        localStorage.removeItem(BUDGET_KEY);
        updateBudgetUI();
        closeModal(budgetModal);
        showToast('Orçamento removido.', 'info');
    });

    $('budgetCancel').addEventListener('click', () => closeModal(budgetModal));
    budgetModal.addEventListener('click', e => {
        if (e.target === budgetModal) closeModal(budgetModal);
    });

    /* ============================================
       FILTER & SORT
       ============================================ */
    function getFilteredProducts() {
        const search = searchInput.value.trim().toLowerCase();
        const filterCat = filterCategorySelect.value;
        const sort = sortOrderSelect.value;

        let result = products.filter(p => {
            if (search && !p.name.toLowerCase().includes(search)) return false;
            if (filterCat !== 'all' && p.category !== filterCat) return false;

            if (activeFilter === 'pending' && p.purchased) return false;
            if (activeFilter === 'purchased' && !p.purchased) return false;
            if (activeFilter === 'high' && p.priority !== 'alta') return false;

            return true;
        });

        switch (sort) {
            case 'category':
                result.sort((a, b) => a.category.localeCompare(b.category, 'pt-BR'));
                break;
            case 'name':
                result.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
                break;
            case 'priority':
                result.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
                break;
            case 'price':
                result.sort((a, b) => (b.price || 0) - (a.price || 0));
                break;
            case 'oldest':
                result.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
                break;
            case 'recent':
            default:
                result.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                break;
        }

        return result;
    }

    /* ============================================
       RENDER
       ============================================ */
    function render() {
        const filtered = getFilteredProducts();
        productList.innerHTML = '';

        if (products.length === 0) {
            emptyState.classList.add('visible');
            emptyState.querySelector('h3').textContent = 'Sua lista está vazia';
            emptyState.querySelector('p').textContent = 'Adicione produtos no formulário acima para começar.';
        } else if (filtered.length === 0) {
            emptyState.classList.add('visible');
            emptyState.querySelector('h3').textContent = 'Nenhum produto encontrado';
            emptyState.querySelector('p').textContent = 'Tente ajustar a busca ou os filtros aplicados.';
        } else {
            emptyState.classList.remove('visible');
            filtered.forEach(p => productList.appendChild(buildProductItem(p)));
        }

        visibleCountEl.textContent = filtered.length;
        updateStats();
        updateCategoryFilter();
        updateBudgetUI();
        updateCategoryChart();
        updateBulkBar();
    }

    function buildProductItem(product) {
        const li = document.createElement('li');
        li.className = 'product-item';
        if (product.purchased) li.classList.add('purchased');
        if (product.priority === 'alta') li.classList.add('priority-alta');
        if (product.priority === 'baixa') li.classList.add('priority-baixa');
        if (selectedIds.has(product.id)) li.classList.add('selected');
        li.dataset.id = product.id;
        li.draggable = true;

        const icon = CATEGORY_ICONS[product.category] || 'fa-tag';
        const total = calcTotal(product);
        const isSelected = selectedIds.has(product.id);
        const selectIconClass = isSelected ? 'fas fa-square-check' : 'far fa-square';

        const priorityBadge = product.priority === 'alta'
            ? '<span class="priority-flag alta"><i class="fas fa-fire"></i> Alta</span>'
            : product.priority === 'baixa'
                ? '<span class="priority-flag baixa"><i class="fas fa-arrow-down"></i> Baixa</span>'
                : '';

        const priceMeta = product.price > 0
            ? `<span class="product-price"><i class="fas fa-dollar-sign"></i> ${formatCurrency(product.price)} × ${product.quantity} = ${formatCurrency(total)}</span>`
            : `<span><i class="fas fa-hashtag"></i> Quantidade: ${product.quantity}</span>`;

        li.innerHTML = `
            <span class="drag-handle" title="Arraste para reordenar">
                <i class="fas fa-grip-vertical"></i>
            </span>
            <label class="checkbox-wrapper">
                <input type="checkbox" ${product.purchased ? 'checked' : ''} aria-label="Marcar como comprado">
            </label>
            <div class="product-info">
                <span class="product-name">
                    ${escapeHtml(product.name)}
                    ${priorityBadge}
                </span>
                <div class="product-meta">
                    <span class="category-badge">
                        <i class="fas ${icon}"></i> ${escapeHtml(product.category)}
                    </span>
                    ${priceMeta}
                    <span><i class="far fa-clock"></i> ${formatDate(product.createdAt)}</span>
                </div>
            </div>
            <div class="product-actions">
                <button class="btn-icon" data-action="select" title="Selecionar para ações em massa">
                    <i class="${selectIconClass}"></i>
                </button>
                <button class="btn-icon" data-action="edit" title="Editar">
                    <i class="fas fa-pen"></i>
                </button>
                <button class="btn-icon btn-icon-danger" data-action="delete" title="Excluir">
                    <i class="fas fa-trash-can"></i>
                </button>
            </div>
        `;

        // Event listeners
        li.querySelector('input[type="checkbox"]').addEventListener('change', () => {
            togglePurchased(product.id);
        });

        li.querySelectorAll('[data-action]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = btn.dataset.action;
                if (action === 'edit') openEdit(product.id);
                else if (action === 'delete') removeProduct(product.id);
                else if (action === 'select') toggleSelected(product.id);
            });
        });

        // Drag & drop
        li.addEventListener('dragstart', () => {
            draggedId = product.id;
            li.classList.add('dragging');
        });
        li.addEventListener('dragend', () => {
            li.classList.remove('dragging');
            $$('.product-item').forEach(el => el.classList.remove('drag-over'));
        });
        li.addEventListener('dragover', (e) => {
            e.preventDefault();
            if (draggedId && draggedId !== product.id) {
                li.classList.add('drag-over');
            }
        });
        li.addEventListener('dragleave', () => li.classList.remove('drag-over'));
        li.addEventListener('drop', (e) => {
            e.preventDefault();
            if (draggedId && draggedId !== product.id) {
                reorderProducts(draggedId, product.id);
            }
            li.classList.remove('drag-over');
        });

        return li;
    }

    function reorderProducts(fromId, toId) {
        const fromIdx = products.findIndex(p => p.id === fromId);
        const toIdx = products.findIndex(p => p.id === toId);
        if (fromIdx === -1 || toIdx === -1) return;
        const [moved] = products.splice(fromIdx, 1);
        products.splice(toIdx, 0, moved);
        saveProducts();
        render();
    }

    /* ============================================
       STATS & CHART
       ============================================ */
    const counterTimers = new WeakMap();

    function animateCounter(el, target) {
        // Cancela animação anterior do mesmo elemento
        const prev = counterTimers.get(el);
        if (prev) clearInterval(prev);

        const current = parseInt(el.textContent, 10) || 0;
        if (current === target) {
            el.textContent = target;
            return;
        }
        const step = target > current ? 1 : -1;
        const duration = 400;
        const steps = Math.abs(target - current);
        const interval = Math.max(duration / steps, 20);
        let value = current;

        const timer = setInterval(() => {
            value += step;
            el.textContent = value;
            if (value === target) {
                clearInterval(timer);
                counterTimers.delete(el);
            }
        }, interval);

        counterTimers.set(el, timer);
    }

    function isAnyModalOpen() {
        return [confirmModal, editModal, budgetModal, shortcutsModal]
            .some(m => m.classList.contains('visible'));
    }

    function updateStats() {
        const total = products.length;
        const purchased = products.filter(p => p.purchased).length;
        const pending = total - purchased;
        const categories = new Set(products.map(p => p.category)).size;
        const totalCost = products.reduce((sum, p) => sum + calcTotal(p), 0);

        animateCounter(totalItemsEl, total);
        animateCounter(purchasedItemsEl, purchased);
        animateCounter(pendingItemsEl, pending);
        animateCounter(totalCategoriesEl, categories);

        totalCostEl.textContent = formatCurrency(totalCost);

        const percent = total > 0 ? Math.round((purchased / total) * 100) : 0;
        progressFill.style.width = `${percent}%`;
        progressPercent.textContent = `${percent}%`;
        progressDetail.textContent = `${purchased} de ${total} comprados`;
    }

    function updateCategoryFilter() {
        const currentValue = filterCategorySelect.value;
        const used = [...new Set(products.map(p => p.category))].sort((a, b) =>
            a.localeCompare(b, 'pt-BR')
        );

        filterCategorySelect.innerHTML = '<option value="all">Todas as categorias</option>';
        used.forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat;
            opt.textContent = cat;
            filterCategorySelect.appendChild(opt);
        });

        if (currentValue && (currentValue === 'all' || used.includes(currentValue))) {
            filterCategorySelect.value = currentValue;
        }
    }

    function updateCategoryChart() {
        if (products.length === 0) {
            categoryChartEl.innerHTML = '<div class="chart-empty">Sem dados ainda</div>';
            return;
        }

        const counts = {};
        products.forEach(p => {
            counts[p.category] = (counts[p.category] || 0) + 1;
        });

        const total = products.length;
        const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);

        categoryChartEl.innerHTML = sorted.map(([cat, count]) => {
            const percent = Math.round((count / total) * 100);
            const color = CATEGORY_COLORS[cat] || '#64748b';
            return `
                <div class="chart-row">
                    <span class="chart-dot" style="background:${color}"></span>
                    <span class="chart-label">${escapeHtml(cat)}</span>
                    <span class="chart-value">${count}</span>
                    <span class="chart-track">
                        <span class="chart-fill" style="width:${percent}%;background:${color}"></span>
                    </span>
                </div>
            `;
        }).join('');
    }

    /* ============================================
       VOICE INPUT
       ============================================ */
    function initVoice() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            $('voiceInput').style.display = 'none';
            return;
        }

        recognition = new SpeechRecognition();
        recognition.lang = 'pt-BR';
        recognition.continuous = false;
        recognition.interimResults = false;

        recognition.onresult = (e) => {
            const text = e.results[0][0].transcript.trim();
            productNameInput.value = text;
            productNameInput.focus();
            showToast(`Reconhecido: "${text}"`, 'info');
        };

        recognition.onerror = () => {
            showToast('Erro no reconhecimento de voz.', 'error');
            $('voiceInput').classList.remove('listening');
        };

        recognition.onend = () => {
            $('voiceInput').classList.remove('listening');
        };
    }

    function startVoice() {
        if (!recognition) {
            showToast('Comando de voz indisponível no seu navegador.', 'warning');
            return;
        }
        try {
            recognition.start();
            $('voiceInput').classList.add('listening');
            showToast('Ouvindo... fale o nome do produto.', 'info');
        } catch (e) {
            $('voiceInput').classList.remove('listening');
        }
    }

    $('voiceInput').addEventListener('click', startVoice);

    /* ============================================
       CONFETTI
       ============================================ */
    function celebrateCompletion() {
        showToast('🎉 Lista completa! Parabéns!', 'success');
        runConfetti();
    }

    function runConfetti() {
        const canvas = $('confettiCanvas');
        const ctx = canvas.getContext('2d');
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        canvas.classList.add('active');

        const colors = ['#6366f1', '#ec4899', '#10b981', '#f59e0b', '#06b6d4', '#8b5cf6'];
        const particles = [];

        for (let i = 0; i < 120; i++) {
            particles.push({
                x: Math.random() * canvas.width,
                y: -20,
                vx: (Math.random() - 0.5) * 6,
                vy: Math.random() * 4 + 2,
                size: Math.random() * 8 + 4,
                color: colors[Math.floor(Math.random() * colors.length)],
                rotation: Math.random() * 360,
                rotSpeed: (Math.random() - 0.5) * 8
            });
        }

        let frames = 0;
        function animate() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            particles.forEach(p => {
                p.x += p.vx;
                p.y += p.vy;
                p.vy += 0.12;
                p.rotation += p.rotSpeed;

                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate(p.rotation * Math.PI / 180);
                ctx.fillStyle = p.color;
                ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
                ctx.restore();
            });

            frames++;
            if (frames < 180) {
                requestAnimationFrame(animate);
            } else {
                canvas.classList.remove('active');
                ctx.clearRect(0, 0, canvas.width, canvas.height);
            }
        }
        animate();
    }

    /* ============================================
       PDF EXPORT
       ============================================ */
    function exportToPDF() {
        if (products.length === 0) {
            showToast('Adicione itens antes de exportar.', 'warning');
            return;
        }

        try {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF('p', 'mm', 'a4');

            const PAGE_W = 210, PAGE_H = 297, MARGIN = 14;

            const C = {
                primary:   [99, 102, 241],
                primaryLt: [129, 140, 248],
                accent:    [236, 72, 153],
                success:   [16, 185, 129],
                warning:   [245, 158, 11],
                danger:    [239, 68, 68],
                dark:      [15, 23, 42],
                text:      [51, 65, 85],
                muted:     [148, 163, 184],
                light:     [241, 245, 249],
                lighter:   [248, 250, 252],
                white:     [255, 255, 255],
                border:    [226, 232, 240]
            };

            // Header gradient
            const headerH = 44;
            const steps = 80;
            for (let i = 0; i < steps; i++) {
                const r = i / steps;
                const cr = Math.round(C.primary[0] + (C.accent[0] - C.primary[0]) * r);
                const cg = Math.round(C.primary[1] + (C.accent[1] - C.primary[1]) * r);
                const cb = Math.round(C.primary[2] + (C.accent[2] - C.primary[2]) * r);
                doc.setFillColor(cr, cg, cb);
                doc.rect((PAGE_W / steps) * i, 0, PAGE_W / steps + 0.5, headerH, 'F');
            }

            // Decorative circles
            doc.setFillColor(255, 255, 255);
            if (doc.GState) {
                doc.setGState(new doc.GState({ opacity: 0.1 }));
                doc.circle(185, 10, 24, 'F');
                doc.circle(200, 38, 12, 'F');
                doc.circle(160, 42, 8, 'F');
                doc.setGState(new doc.GState({ opacity: 1 }));
            }

            // Logo
            doc.setFillColor(255, 255, 255);
            doc.roundedRect(MARGIN, 12, 20, 20, 4, 4, 'F');
            doc.setTextColor(...C.primary);
            doc.setFontSize(14);
            doc.setFont('helvetica', 'bold');
            doc.text('SL', MARGIN + 10, 25, { align: 'center' });

            // Title
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(22);
            doc.setFont('helvetica', 'bold');
            doc.text('SmartList', MARGIN + 26, 22);

            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');
            doc.text('Lista de Compras Inteligente', MARGIN + 26, 29);

            // Date
            const now = new Date();
            doc.setFontSize(9);
            doc.text(now.toLocaleDateString('pt-BR', {
                day: '2-digit', month: 'long', year: 'numeric'
            }), PAGE_W - MARGIN, 20, { align: 'right' });
            doc.setFontSize(8);
            doc.text(`Gerado às ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`,
                PAGE_W - MARGIN, 26, { align: 'right' });

            // Stats
            const total = products.length;
            const purchased = products.filter(p => p.purchased).length;
            const pending = total - purchased;
            const categories = new Set(products.map(p => p.category)).size;
            const totalCost = products.reduce((sum, p) => sum + calcTotal(p), 0);
            const percent = total > 0 ? Math.round((purchased / total) * 100) : 0;

            const cardsY = headerH + 8;
            const cardW = (PAGE_W - MARGIN * 2 - 12) / 4;
            const cardH = 22;
            const gap = 4;

            const stats = [
                { label: 'TOTAL', value: total, color: C.primary },
                { label: 'COMPRADOS', value: purchased, color: C.success },
                { label: 'PENDENTES', value: pending, color: C.warning },
                { label: 'CATEGORIAS', value: categories, color: C.dark }
            ];

            stats.forEach((s, i) => {
                const x = MARGIN + (cardW + gap) * i;
                doc.setFillColor(...C.border);
                doc.roundedRect(x + 0.5, cardsY + 0.5, cardW, cardH, 2, 2, 'F');
                doc.setFillColor(...C.white);
                doc.roundedRect(x, cardsY, cardW, cardH, 2, 2, 'F');
                doc.setFillColor(...s.color);
                doc.roundedRect(x, cardsY, 1.5, cardH, 2, 2, 'F');

                doc.setTextColor(...s.color);
                doc.setFontSize(16);
                doc.setFont('helvetica', 'bold');
                doc.text(String(s.value), x + 6, cardsY + 12);

                doc.setTextColor(...C.muted);
                doc.setFontSize(7);
                doc.text(s.label, x + 6, cardsY + 17);
            });

            // Progress
            const progY = cardsY + cardH + 8;
            const progW = PAGE_W - MARGIN * 2;
            doc.setTextColor(...C.text);
            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            doc.text('Progresso da lista', MARGIN, progY - 1);
            doc.setTextColor(...C.primary);
            doc.setFontSize(11);
            doc.text(`${percent}%`, PAGE_W - MARGIN, progY - 1, { align: 'right' });

            doc.setFillColor(...C.light);
            doc.roundedRect(MARGIN, progY + 1, progW, 6, 3, 3, 'F');
            if (percent > 0) {
                doc.setFillColor(...C.success);
                doc.roundedRect(MARGIN, progY + 1, (progW * percent) / 100, 6, 3, 3, 'F');
            }

            // Total cost banner
            const costY = progY + 12;
            doc.setFillColor(...C.lighter);
            doc.roundedRect(MARGIN, costY, progW, 14, 3, 3, 'F');
            doc.setTextColor(...C.text);
            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            doc.text('Valor total estimado', MARGIN + 4, costY + 9);
            doc.setTextColor(...C.success);
            doc.setFontSize(13);
            doc.text(formatCurrency(totalCost), PAGE_W - MARGIN - 4, costY + 9, { align: 'right' });

            // Table
            const sorted = [...products].sort((a, b) =>
                a.category.localeCompare(b.category, 'pt-BR') ||
                a.name.localeCompare(b.name, 'pt-BR')
            );

            const hasPrices = products.some(p => p.price > 0);
            const head = hasPrices
                ? [['#', 'Status', 'Produto', 'Categoria', 'Qtd', 'Preço un.', 'Total']]
                : [['#', 'Status', 'Produto', 'Categoria', 'Qtd']];

            const rows = sorted.map((p, idx) => {
                const base = [
                    String(idx + 1).padStart(2, '0'),
                    p.purchased ? 'Comprado' : 'Pendente',
                    p.name,
                    p.category,
                    String(p.quantity)
                ];
                if (hasPrices) {
                    base.push(formatCurrency(p.price));
                    base.push(formatCurrency(calcTotal(p)));
                }
                return base;
            });

            doc.autoTable({
                head,
                body: rows,
                startY: costY + 20,
                theme: 'plain',
                margin: { left: MARGIN, right: MARGIN, bottom: 20 },
                headStyles: {
                    fillColor: C.dark,
                    textColor: 255,
                    fontStyle: 'bold',
                    fontSize: 9,
                    cellPadding: { top: 5, bottom: 5, left: 6, right: 6 }
                },
                bodyStyles: {
                    fontSize: 9.5,
                    cellPadding: { top: 5, bottom: 5, left: 6, right: 6 },
                    textColor: C.text,
                    lineColor: C.border,
                    lineWidth: 0.1
                },
                alternateRowStyles: { fillColor: C.lighter },
                columnStyles: {
                    0: { halign: 'center', cellWidth: 12, textColor: C.muted, fontStyle: 'bold' },
                    1: { halign: 'left', cellWidth: 26 },
                    2: { fontStyle: 'bold' },
                    3: { cellWidth: 32 },
                    4: { halign: 'center', cellWidth: 14, fontStyle: 'bold' }
                },
                didParseCell: (data) => {
                    if (data.section === 'body' && data.column.index === 1) {
                        const isPurchased = data.cell.raw === 'Comprado';
                        data.cell.styles.textColor = isPurchased ? C.success : C.warning;
                        data.cell.styles.fontStyle = 'bold';
                        data.cell.styles.fontSize = 9;
                    }
                    if (data.section === 'body' && data.column.index === 3) {
                        data.cell.styles.textColor = C.primary;
                    }
                    if (hasPrices && data.section === 'body' && data.column.index === 6) {
                        data.cell.styles.textColor = C.success;
                        data.cell.styles.fontStyle = 'bold';
                    }
                },
                didDrawCell: (data) => {
                    if (data.section === 'body' && data.column.index === 1) {
                        const isPurchased = data.cell.raw === 'Comprado';
                        doc.setFillColor(...(isPurchased ? C.success : C.warning));
                        doc.circle(data.cell.x + 3, data.cell.y + data.cell.height / 2, 1.2, 'F');
                    }
                }
            });

            // Footer on all pages
            const pageCount = doc.internal.getNumberOfPages();
            for (let i = 1; i <= pageCount; i++) {
                doc.setPage(i);
                doc.setDrawColor(...C.border);
                doc.setLineWidth(0.3);
                doc.line(MARGIN, PAGE_H - 14, PAGE_W - MARGIN, PAGE_H - 14);

                doc.setFontSize(8);
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(...C.muted);
                doc.text('SmartList — Lista de Compras Inteligente', MARGIN, PAGE_H - 8);
                doc.text(`Página ${i} de ${pageCount}`, PAGE_W / 2, PAGE_H - 8, { align: 'center' });
                doc.text(`${total} ${total === 1 ? 'item' : 'itens'}`, PAGE_W - MARGIN, PAGE_H - 8, { align: 'right' });
            }

            doc.save(`smartlist-${new Date().toISOString().slice(0, 10)}.pdf`);
            showToast('PDF exportado!', 'success');
        } catch (err) {
            console.error(err);
            showToast('Erro ao gerar PDF.', 'error');
        }
    }

    /* ============================================
       JSON IMPORT / EXPORT
       ============================================ */
    function exportJSON() {
        if (products.length === 0) {
            showToast('Lista vazia.', 'warning');
            return;
        }
        const data = {
            exportedAt: new Date().toISOString(),
            createdAt: getCreationDate(),
            budget,
            products
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `smartlist-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('JSON exportado!', 'success');
    }

    function importJSON(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                const items = Array.isArray(data) ? data : data.products;
                if (!Array.isArray(items)) throw new Error('Formato inválido');

                openConfirm(
                    'Importar lista',
                    `Importar ${pluralize(items.length, 'item', 'itens')}? Os dados atuais serão substituídos.`,
                    () => {
                        products = items.map(p => ({
                            id: p.id || generateId(),
                            name: p.name || 'Produto sem nome',
                            category: p.category || 'Outros',
                            quantity: parseInt(p.quantity, 10) || 1,
                            price: parseFloat(p.price) || 0,
                            priority: p.priority || 'normal',
                            purchased: !!p.purchased,
                            createdAt: p.createdAt || new Date().toISOString()
                        }));
                        if (data.budget) {
                            budget = data.budget;
                            storage.save(BUDGET_KEY, budget);
                        }
                        saveProducts();
                        render();
                        showToast(`${pluralize(items.length, 'item importado', 'itens importados')}!`, 'success');
                    }
                );
            } catch (err) {
                showToast('Arquivo JSON inválido ou corrompido.', 'error');
            }
        };
        reader.readAsText(file);
    }

    $('exportPdf').addEventListener('click', exportToPDF);
    $('exportJson').addEventListener('click', exportJSON);
    $('importJson').addEventListener('click', () => $('importFile').click());
    $('importFile').addEventListener('change', (e) => {
        if (e.target.files[0]) importJSON(e.target.files[0]);
        e.target.value = '';
    });
    $('printList').addEventListener('click', () => window.print());
    $('clearAll').addEventListener('click', clearAll);

    /* ============================================
       FORM
       ============================================ */
    productForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = productNameInput.value.trim();
        if (!name) {
            showToast('Informe o nome do produto.', 'warning');
            productNameInput.focus();
            return;
        }
        addProduct({
            name,
            category: productCategorySelect.value,
            quantity: productQuantityInput.value,
            price: productPriceInput.value,
            priority: productPriorityInput.value
        });
        productForm.reset();
        productQuantityInput.value = 1;
        productPriorityInput.value = 'normal';
        productNameInput.focus();
    });

    /* ============================================
       SEARCH / FILTERS
       ============================================ */
    searchInput.addEventListener('input', () => {
        clearSearchBtn.classList.toggle('visible', searchInput.value.length > 0);
        render();
    });

    clearSearchBtn.addEventListener('click', () => {
        searchInput.value = '';
        clearSearchBtn.classList.remove('visible');
        render();
        searchInput.focus();
    });

    filterCategorySelect.addEventListener('change', render);
    sortOrderSelect.addEventListener('change', render);

    $$('.pill').forEach(pill => {
        pill.addEventListener('click', () => {
            $$('.pill').forEach(p => p.classList.remove('pill-active'));
            pill.classList.add('pill-active');
            activeFilter = pill.dataset.filter;
            render();
        });
    });

    /* ============================================
       FAB
       ============================================ */
    $('fab').addEventListener('click', () => {
        productNameInput.focus();
        productNameInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });

    /* ============================================
       SHORTCUTS
       ============================================ */
    $('showShortcuts').addEventListener('click', () => openModal(shortcutsModal));
    $('shortcutsClose').addEventListener('click', () => closeModal(shortcutsModal));
    shortcutsModal.addEventListener('click', e => {
        if (e.target === shortcutsModal) closeModal(shortcutsModal);
    });

    document.addEventListener('keydown', (e) => {
        const inInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName);

        if (e.key === 'Escape') {
            if (confirmModal.classList.contains('visible')) closeModal(confirmModal);
            else if (editModal.classList.contains('visible')) closeModal(editModal);
            else if (budgetModal.classList.contains('visible')) closeModal(budgetModal);
            else if (shortcutsModal.classList.contains('visible')) closeModal(shortcutsModal);
            else if (searchInput.value) {
                searchInput.value = '';
                clearSearchBtn.classList.remove('visible');
                render();
            }
            return;
        }

        // Ignora atalhos enquanto está digitando ou com modal aberto
        if (inInput || isAnyModalOpen()) return;

        if (e.ctrlKey && (e.key === 'k' || e.key === 'K')) {
            e.preventDefault();
            searchInput.focus();
            return;
        }

        // Atalhos sem Ctrl/Alt/Meta
        if (e.ctrlKey || e.altKey || e.metaKey) return;

        switch (e.key.toLowerCase()) {
            case 'n':
                e.preventDefault();
                productNameInput.focus();
                productNameInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
                break;
            case 't':
                toggleTheme();
                break;
            case 'v':
                startVoice();
                break;
            case 'p':
                exportToPDF();
                break;
            case '?':
                openModal(shortcutsModal);
                break;
        }
    });

    /* ============================================
       PWA INSTALL
       ============================================ */
    let deferredPrompt = null;
    const installBtn = $('installApp');

    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        installBtn.hidden = false;
    });

    installBtn.addEventListener('click', async () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        await deferredPrompt.userChoice;
        deferredPrompt = null;
        installBtn.hidden = true;
    });

    window.addEventListener('appinstalled', () => {
        installBtn.hidden = true;
        deferredPrompt = null;
        showToast('SmartList instalado com sucesso!', 'success');
    });

    // Esconde o botão se já estiver rodando como app instalado
    if (window.matchMedia('(display-mode: standalone)').matches ||
        window.navigator.standalone) {
        installBtn.hidden = true;
    }

    /* ============================================
       OFFLINE DETECTION
       ============================================ */
    const offlineBanner = $('offlineBanner');

    function updateOnlineStatus() {
        if (navigator.onLine) {
            offlineBanner.hidden = true;
        } else {
            offlineBanner.hidden = false;
        }
    }

    window.addEventListener('online', () => {
        updateOnlineStatus();
        showToast('Conexão restabelecida!', 'success');
    });
    window.addEventListener('offline', () => {
        updateOnlineStatus();
        showToast('Você está offline. Tudo continua funcionando.', 'info');
    });

    /* ============================================
       INIT
       ============================================ */
    function init() {
        loadTheme();
        products = storage.load(STORAGE_KEY, []);
        nameHistory = storage.load(HISTORY_KEY, []);
        loadBudget();

        creationDateSpan.textContent = formatDate(getCreationDate());
        renderSuggestions();
        initVoice();
        updateOnlineStatus();
        render();

        // Foca campo de adicionar se vier via shortcut do PWA
        const params = new URLSearchParams(window.location.search);
        if (params.get('action') === 'add') {
            setTimeout(() => productNameInput.focus(), 300);
        }
    }

    init();
})();
