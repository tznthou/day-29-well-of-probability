/**
 * Main Application Entry
 * 機率之井 - The Well of Probability
 */

import { state } from './state.js';
import { loadAllData, calculateStats } from './dataController.js';
import { updateCharts, highlightOnCharts } from './plotlyChart.js';
import { initArena, updateArena, highlightNode, highlightPair } from './d3Arena.js';

// ============================================================
// 應用程式常量
// ============================================================

/** 最小 loading 顯示時間 (ms)，讓用戶能欣賞井的漣漪動畫 */
const MIN_LOADING_TIME = 2000;

/** 導覽彈窗延遲 (ms)，等待 loading 結束後再顯示 */
const GUIDE_MODAL_DELAY = 500;

/**
 * Initialize application
 */
async function init() {
    console.log('機率之井 - 初始化中...');

    // Show loading state
    showLoading(true);
    const loadingStart = Date.now();

    try {
        // Load all CSV data
        await loadAllData();
        console.log('數據載入完成');

        // Calculate initial statistics
        calculateStats();
        console.log('統計計算完成');

        // Initialize UI controls
        initControls();

        // Initialize D3 arena
        initArena();

        // Render charts
        updateCharts();

        // Render arena
        updateArena();

        // Subscribe to state changes
        state.subscribe(handleStateChange);

        console.log('初始化完成');
    } catch (error) {
        console.error('初始化失敗:', error);
        showError('數據載入失敗，請重新整理頁面');
    } finally {
        // 確保 loading 至少顯示 MIN_LOADING_TIME
        const elapsed = Date.now() - loadingStart;
        const remaining = Math.max(0, MIN_LOADING_TIME - elapsed);

        setTimeout(() => {
            showLoading(false);
        }, remaining);
    }
}

/**
 * Initialize control buttons
 */
function initControls() {
    // Lottery type toggle
    setupToggleGroup('lottery-type', (value) => {
        state.update('lotteryType', value);
    });

    // Year toggle
    setupToggleGroup('year-select', (value) => {
        state.update('year', value);
    });

    // Gap range toggle
    setupToggleGroup('gap-range', (value) => {
        state.update('gapRange', value);
    });

    // Guide modal
    initGuideModal();
}

/**
 * Initialize guide modal
 */
function initGuideModal() {
    const modal = document.getElementById('guide-modal');
    const guideBtn = document.getElementById('guide-btn');
    const closeBtn = modal?.querySelector('.modal-close');
    const confirmBtn = modal?.querySelector('.modal-confirm-btn');
    const backdrop = modal?.querySelector('.modal-backdrop');

    if (!modal) return;

    // Check if first visit
    const hasSeenGuide = localStorage.getItem('wellOfProbability_guideSeen');

    // Show modal on first visit (after loading completes)
    if (!hasSeenGuide) {
        // Will be shown after loading overlay hides
        setTimeout(() => {
            showGuideModal(true);
        }, MIN_LOADING_TIME + GUIDE_MODAL_DELAY);
    }

    // Open guide button
    guideBtn?.addEventListener('click', () => {
        showGuideModal(true);
    });

    // Close button
    closeBtn?.addEventListener('click', () => {
        showGuideModal(false);
    });

    // Confirm button
    confirmBtn?.addEventListener('click', () => {
        showGuideModal(false);
        // Remember user has seen the guide
        localStorage.setItem('wellOfProbability_guideSeen', 'true');
    });

    // Click backdrop to close
    backdrop?.addEventListener('click', () => {
        showGuideModal(false);
    });

    // ESC key to close
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
            showGuideModal(false);
        }
    });
}

/**
 * Show/hide guide modal
 */
function showGuideModal(show) {
    const modal = document.getElementById('guide-modal');
    if (!modal) return;

    if (show) {
        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    } else {
        modal.classList.add('hidden');
        document.body.style.overflow = '';
    }
}

/**
 * Setup toggle button group (with ARIA support)
 */
function setupToggleGroup(groupId, onChange) {
    const group = document.getElementById(groupId);
    if (!group) return;

    const buttons = group.querySelectorAll('.toggle-btn');

    buttons.forEach(btn => {
        btn.addEventListener('click', () => {
            // Remove active and update aria-checked for all
            buttons.forEach(b => {
                b.classList.remove('active');
                b.setAttribute('aria-checked', 'false');
            });
            // Add active to clicked and update aria-checked
            btn.classList.add('active');
            btn.setAttribute('aria-checked', 'true');
            // Trigger change
            onChange(btn.dataset.value);
        });

        // Keyboard navigation: Arrow keys to move between options
        btn.addEventListener('keydown', (e) => {
            const btnsArray = Array.from(buttons);
            const currentIndex = btnsArray.indexOf(btn);
            let targetIndex = -1;

            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                e.preventDefault();
                targetIndex = (currentIndex + 1) % btnsArray.length;
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                e.preventDefault();
                targetIndex = (currentIndex - 1 + btnsArray.length) % btnsArray.length;
            }

            if (targetIndex >= 0) {
                btnsArray[targetIndex].focus();
                btnsArray[targetIndex].click();
            }
        });
    });
}

/**
 * Handle state changes (with error boundary)
 */
function handleStateChange(changeType, currentState) {
    try {
        switch (changeType) {
            case 'lotteryType':
            case 'year':
            case 'gapRange':
                // Clear any existing selection
                state.clearSelection();
                // Recalculate stats and update visualizations
                calculateStats();
                updateCharts();
                updateArena();
                break;

            case 'selection':
                // Highlight on both engines
                highlightOnCharts(currentState.selectedNumber);
                highlightNode(currentState.selectedNumber);
                break;

            case 'pairSelection':
                // Highlight pair in arena
                if (currentState.selectedPair) {
                    highlightPair(currentState.selectedPair.num1, currentState.selectedPair.num2);
                }
                break;

            default:
                console.warn(`Unknown state change type: ${changeType}`);
        }
    } catch (error) {
        console.error(`Error handling state change "${changeType}":`, error);
        showError(`更新視覺化時發生錯誤：${error.message}`);

        // Attempt recovery: reset to safe state
        try {
            state.clearSelection();
        } catch (recoveryError) {
            console.error('Failed to recover:', recoveryError);
        }
    }
}

/**
 * Show/hide loading overlay
 * 使用 CSS class 控制井的漣漪動畫
 */
function showLoading(show) {
    const overlay = document.getElementById('loading-overlay');
    if (!overlay) return;

    if (show) {
        overlay.classList.remove('hidden');
    } else {
        overlay.classList.add('hidden');
    }
}

/**
 * Show error message
 */
function showError(message) {
    const container = document.querySelector('.container');
    if (!container) return;

    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.style.cssText = `
        background: rgba(239, 68, 68, 0.2);
        border: 1px solid #ef4444;
        color: #fca5a5;
        padding: 1rem;
        border-radius: 8px;
        margin: 1rem 0;
        text-align: center;
    `;
    errorDiv.textContent = message;

    container.insertBefore(errorDiv, container.firstChild);
}

// Start application when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
