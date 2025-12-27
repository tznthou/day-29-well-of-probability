/**
 * Plotly Chart Module
 * 統計面板：頻率直方圖 + 年度對比圖
 */

import { state } from './state.js';
import { getNumberRange, getComparisonData, calculateCoOccurrence, Z_SCORE_THRESHOLD } from './dataController.js';

// ============================================================
// 圖表常量
// ============================================================

const COLORS = {
    blue: '#38bdf8',
    amber: '#fbbf24',
    ice: '#67e8f9',
    bg: '#1e293b',
    grid: '#334155',
    text: '#94a3b8'
};

/** 圖表邊距 */
const CHART_MARGIN = { top: 30, right: 30, bottom: 50, left: 50 };

/** X 軸刻度間距 */
const X_AXIS_DTICK = {
    lotto: 5,   // 大樂透每 5 格一個標籤
    super: 4    // 威力彩每 4 格一個標籤
};

/** 命運共同體顯示數量 */
const TOP_PAIRS_COUNT = 10;

/** 圖表線條寬度 */
const LINE_WIDTH = {
    thin: 1,
    normal: 2,
    highlight: 3
};

const LAYOUT_BASE = {
    paper_bgcolor: 'transparent',
    plot_bgcolor: 'transparent',
    font: {
        family: 'SF Mono, Fira Code, Consolas, monospace',
        color: COLORS.text
    },
    margin: { t: CHART_MARGIN.top, r: CHART_MARGIN.right, b: CHART_MARGIN.bottom, l: CHART_MARGIN.left },
    xaxis: {
        gridcolor: COLORS.grid,
        zerolinecolor: COLORS.grid
    },
    yaxis: {
        gridcolor: COLORS.grid,
        zerolinecolor: COLORS.grid
    }
};

/**
 * Render frequency histogram
 */
export function renderFrequencyChart() {
    const { frequency, zScores, mean, stdDev } = state.stats;
    const range = getNumberRange();

    const numbers = [];
    const counts = [];
    const colors = [];

    for (let i = 1; i <= range.main; i++) {
        numbers.push(i);
        counts.push(frequency[i] || 0);

        // Color by Z-score
        const z = zScores[i] || 0;
        if (z > Z_SCORE_THRESHOLD) {
            colors.push(COLORS.amber);
        } else if (z < -Z_SCORE_THRESHOLD) {
            colors.push(COLORS.ice);
        } else {
            colors.push(COLORS.blue);
        }
    }

    const trace = {
        x: numbers,
        y: counts,
        type: 'bar',
        marker: {
            color: colors,
            line: {
                color: 'rgba(0,0,0,0.3)',
                width: LINE_WIDTH.thin
            }
        },
        hovertemplate: '<b>號碼 %{x}</b><br>出現次數: %{y}<extra></extra>'
    };

    // Standard deviation bands
    const shapes = [];
    const annotations = [];

    if (stdDev > 0) {
        // Mean line
        shapes.push({
            type: 'line',
            x0: 0,
            x1: range.main + 1,
            y0: mean,
            y1: mean,
            line: { color: COLORS.text, width: LINE_WIDTH.thin, dash: 'dash' }
        });

        // +1 SD
        shapes.push({
            type: 'line',
            x0: 0,
            x1: range.main + 1,
            y0: mean + stdDev,
            y1: mean + stdDev,
            line: { color: COLORS.amber, width: LINE_WIDTH.thin, dash: 'dot' }
        });

        // -1 SD
        shapes.push({
            type: 'line',
            x0: 0,
            x1: range.main + 1,
            y0: mean - stdDev,
            y1: mean - stdDev,
            line: { color: COLORS.ice, width: LINE_WIDTH.thin, dash: 'dot' }
        });

        // +2 SD (天選之子閾值)
        shapes.push({
            type: 'line',
            x0: 0,
            x1: range.main + 1,
            y0: mean + Z_SCORE_THRESHOLD * stdDev,
            y1: mean + Z_SCORE_THRESHOLD * stdDev,
            line: { color: COLORS.amber, width: LINE_WIDTH.normal }
        });

        // -2 SD (被遺忘者閾值)
        shapes.push({
            type: 'line',
            x0: 0,
            x1: range.main + 1,
            y0: Math.max(0, mean - Z_SCORE_THRESHOLD * stdDev),
            y1: Math.max(0, mean - Z_SCORE_THRESHOLD * stdDev),
            line: { color: COLORS.ice, width: LINE_WIDTH.normal }
        });

        annotations.push({
            x: range.main,
            y: mean,
            text: `平均 ${mean.toFixed(1)}`,
            showarrow: false,
            xanchor: 'left',
            font: { size: 10, color: COLORS.text }
        });
    }

    const layout = {
        ...LAYOUT_BASE,
        shapes,
        annotations,
        xaxis: {
            ...LAYOUT_BASE.xaxis,
            title: '號碼',
            dtick: X_AXIS_DTICK[state.lotteryType]
        },
        yaxis: {
            ...LAYOUT_BASE.yaxis,
            title: '出現次數'
        },
        bargap: 0.1
    };

    Plotly.react('frequency-chart', [trace], layout, { responsive: true, displayModeBar: false });

    // Add click handler (remove old listener first to prevent duplicates)
    const chartEl = document.getElementById('frequency-chart');
    if (chartEl.removeAllListeners) {
        chartEl.removeAllListeners('plotly_click');
    }
    chartEl.on('plotly_click', (data) => {
        if (data.points && data.points[0]) {
            const num = data.points[0].x;
            state.setSelectedNumber(num);
        }
    });
}

/**
 * Render year comparison chart
 */
export function renderComparisonChart() {
    const { freq2024, freq2025, draws2024, draws2025 } = getComparisonData();
    const range = getNumberRange();

    const numbers = [];
    const rates2024 = [];
    const rates2025 = [];

    for (let i = 1; i <= range.main; i++) {
        numbers.push(i);
        // Normalize to rate per draw
        rates2024.push(draws2024 > 0 ? (freq2024[i] / draws2024 * 100).toFixed(2) : 0);
        rates2025.push(draws2025 > 0 ? (freq2025[i] / draws2025 * 100).toFixed(2) : 0);
    }

    const trace2024 = {
        x: numbers,
        y: rates2024,
        name: '2024',
        type: 'scatter',
        mode: 'lines+markers',
        line: { color: COLORS.blue, width: LINE_WIDTH.normal },
        marker: { size: 4 },
        hovertemplate: '<b>%{x}</b><br>2024: %{y}%<extra></extra>'
    };

    const trace2025 = {
        x: numbers,
        y: rates2025,
        name: '2025',
        type: 'scatter',
        mode: 'lines+markers',
        line: { color: COLORS.amber, width: LINE_WIDTH.normal },
        marker: { size: 4 },
        hovertemplate: '<b>%{x}</b><br>2025: %{y}%<extra></extra>'
    };

    const layout = {
        ...LAYOUT_BASE,
        xaxis: {
            ...LAYOUT_BASE.xaxis,
            title: '號碼',
            dtick: X_AXIS_DTICK[state.lotteryType]
        },
        yaxis: {
            ...LAYOUT_BASE.yaxis,
            title: '出現率 (%)'
        },
        legend: {
            x: 1,
            y: 1,
            xanchor: 'right',
            bgcolor: 'transparent'
        },
        showlegend: true
    };

    Plotly.react('comparison-chart', [trace2024, trace2025], layout, { responsive: true, displayModeBar: false });

    // Add click handler (remove old listener first to prevent duplicates)
    const chartEl = document.getElementById('comparison-chart');
    if (chartEl.removeAllListeners) {
        chartEl.removeAllListeners('plotly_click');
    }
    chartEl.on('plotly_click', (data) => {
        if (data.points && data.points[0]) {
            const num = data.points[0].x;
            state.setSelectedNumber(num);
        }
    });
}

/**
 * Highlight selected number on charts
 */
export function highlightOnCharts(num) {
    if (!num) {
        // Clear highlight - re-render charts
        renderFrequencyChart();
        renderComparisonChart();
        return;
    }

    // Update frequency chart with highlight
    const freqChart = document.getElementById('frequency-chart');
    if (freqChart && freqChart.data) {
        const range = getNumberRange();
        const colors = freqChart.data[0].marker.color.slice();
        const lineWidths = new Array(range.main).fill(LINE_WIDTH.thin);

        // Highlight selected
        const idx = num - 1;
        if (idx >= 0 && idx < colors.length) {
            lineWidths[idx] = LINE_WIDTH.highlight;
        }

        Plotly.restyle('frequency-chart', {
            'marker.line.width': [lineWidths]
        });
    }
}

/**
 * Render fate partners cards (命運共同體卡片)
 */
export function renderPartners() {
    const container = document.getElementById('partners-container');
    if (!container) return;

    const { matrix, maxNum } = calculateCoOccurrence();

    // Extract all pairs and sort by count
    const pairs = [];
    for (let i = 1; i <= maxNum; i++) {
        for (let j = i + 1; j <= maxNum; j++) {
            if (matrix[i][j] > 0) {
                pairs.push({
                    num1: i,
                    num2: j,
                    count: matrix[i][j]
                });
            }
        }
    }

    // Sort by count descending, take top N
    pairs.sort((a, b) => b.count - a.count);
    const topPairs = pairs.slice(0, TOP_PAIRS_COUNT);

    // Clear container
    container.innerHTML = '';

    // Render cards
    topPairs.forEach((pair, index) => {
        const card = document.createElement('div');
        card.className = 'partner-card';
        card.dataset.num1 = pair.num1;
        card.dataset.num2 = pair.num2;

        // Accessibility attributes
        card.setAttribute('role', 'listitem');
        card.setAttribute('tabindex', '0');
        card.setAttribute('aria-label', `排名 ${index + 1}：號碼 ${pair.num1} 和 ${pair.num2}，共現 ${pair.count} 次`);

        // Use textContent for data values to prevent XSS
        card.innerHTML = `
            <span class="partner-rank"></span>
            <div class="partner-balls">
                <div class="partner-ball"></div>
                <span class="partner-connector">⋮</span>
                <div class="partner-ball"></div>
            </div>
            <div class="partner-count">共現 <strong></strong> 次</div>
        `;
        card.querySelector('.partner-rank').textContent = index + 1;
        const balls = card.querySelectorAll('.partner-ball');
        balls[0].textContent = pair.num1;
        balls[1].textContent = pair.num2;
        card.querySelector('.partner-count strong').textContent = pair.count;

        // Click handler - highlight both numbers in arena
        const handleSelect = () => {
            // Remove active from all cards
            container.querySelectorAll('.partner-card').forEach(c => {
                c.classList.remove('active');
                c.setAttribute('aria-pressed', 'false');
            });
            card.classList.add('active');
            card.setAttribute('aria-pressed', 'true');

            // Set selected pair (custom event)
            state.setSelectedPair(pair.num1, pair.num2);
        };

        card.addEventListener('click', handleSelect);

        // Keyboard navigation: Enter or Space to select
        card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleSelect();
            }
        });

        container.appendChild(card);
    });
}

/**
 * Update all charts
 */
export function updateCharts() {
    renderFrequencyChart();
    renderComparisonChart();
    renderPartners();
}
