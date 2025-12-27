/**
 * D3 Arena Module
 * 命運競技場：力導向圖 + 深度下沉 + 軌道環
 */

import { state } from './state.js';
import { getNumberRange, getStatus, LOTTERY_RANGES } from './dataController.js';

// ============================================================
// 視覺常量
// ============================================================

const COLORS = {
    favorites: '#fbbf24',
    normal: '#38bdf8',
    outcasts: '#67e8f9',
    bg: '#1e293b',
    spotlight: 'rgba(56, 189, 248, 0.3)',
    ripple: '#38bdf8'
};

/** 力導向模擬參數 */
const FORCE_CONFIG = {
    charge: -30,           // 排斥力強度
    collide: 3,            // 碰撞間距
    xStrength: 0.02,       // X軸居中力
    yStrength: 0.1,        // Y軸定位力
    restartAlpha: 0.3      // 重啟時的 alpha
};

/** 節點尺寸配置 */
const NODE_SIZE = {
    min: 8,
    range: 22              // max = min + range = 30
};

/** 深度（Y軸）配置 */
const DEPTH_CONFIG = {
    waterSurface: 0.15,    // 水面線位置
    minRatio: 0.2,         // 節點最小 Y 位置
    maxRatio: 0.85         // 節點最大 Y 位置
};

/** 軌道區配置（威力彩第二區） */
const ORBIT_CONFIG = {
    height: 150,
    padding: 40,
    radiusXRatio: 0.35,
    nodeSize: { min: 12, range: 12 },
    labelOffset: { above: 8, below: 12 }
};

/** 動畫時長 (ms) */
const ANIMATION = {
    spotlight: 300,
    ripple: 1000,
    connection: 500,
    pairRipple: 800
};

/** 視覺效果參數 */
const VISUAL = {
    strokeWidth: { thin: 1, normal: 2, thick: 3 },
    opacity: { dim: 0.2, medium: 0.3, normal: 0.7, full: 0.8, solid: 1 },
    fontSize: { small: '10px', medium: '12px' },
    spotlightWidth: 60,
    rippleExpand: { single: 80, pair: 50 },
    labelOffset: { above: 8, below: 18 },
    dashArray: '5,5'
};

/** 時間配置 */
const TIMING = {
    debounce: 250,
    rippleDelay: 200
};

let svg = null;
let simulation = null;
let nodes = [];
let tooltip = null;
let width = 0;
let height = 0;

/** AbortController for event listener cleanup */
let resizeController = null;

/**
 * Initialize the arena
 */
export function initArena() {
    const container = document.getElementById('arena');
    if (!container) return;

    // Cleanup previous event listeners
    if (resizeController) {
        resizeController.abort();
    }
    resizeController = new AbortController();

    // Get dimensions
    const rect = container.getBoundingClientRect();
    width = rect.width;
    height = rect.height;

    // Clear existing
    container.innerHTML = '';

    // Create SVG
    svg = d3.select(container)
        .append('svg')
        .attr('width', '100%')
        .attr('height', '100%')
        .attr('viewBox', `0 0 ${width} ${height}`);

    // Add gradient definitions
    const defs = svg.append('defs');

    // Well gradient (depth effect)
    const wellGradient = defs.append('linearGradient')
        .attr('id', 'well-gradient')
        .attr('x1', '0%')
        .attr('y1', '0%')
        .attr('x2', '0%')
        .attr('y2', '100%');

    wellGradient.append('stop')
        .attr('offset', '0%')
        .attr('stop-color', 'rgba(56, 189, 248, 0.1)');

    wellGradient.append('stop')
        .attr('offset', '100%')
        .attr('stop-color', 'rgba(0, 0, 0, 0.5)');

    // Background rect with gradient
    svg.append('rect')
        .attr('width', width)
        .attr('height', height)
        .attr('fill', 'url(#well-gradient)');

    // Water surface line
    svg.append('line')
        .attr('class', 'water-surface')
        .attr('x1', 0)
        .attr('x2', width)
        .attr('y1', height * DEPTH_CONFIG.waterSurface)
        .attr('y2', height * DEPTH_CONFIG.waterSurface)
        .attr('stroke', 'rgba(56, 189, 248, 0.3)')
        .attr('stroke-width', VISUAL.strokeWidth.thin)
        .attr('stroke-dasharray', VISUAL.dashArray);

    // Surface label
    svg.append('text')
        .attr('x', 10)
        .attr('y', height * DEPTH_CONFIG.waterSurface - 5)
        .attr('fill', 'rgba(56, 189, 248, 0.5)')
        .attr('font-size', VISUAL.fontSize.small)
        .text('表層');

    // Depth label
    svg.append('text')
        .attr('x', 10)
        .attr('y', height - 10)
        .attr('fill', 'rgba(56, 189, 248, 0.3)')
        .attr('font-size', VISUAL.fontSize.small)
        .text('井底');

    // Groups for layers
    svg.append('g').attr('class', 'spotlight-layer');
    svg.append('g').attr('class', 'ripple-layer');
    svg.append('g').attr('class', 'links-layer');
    svg.append('g').attr('class', 'nodes-layer');
    svg.append('g').attr('class', 'labels-layer');

    // Get tooltip reference
    tooltip = document.getElementById('info-tooltip');

    // Handle window resize (with cleanup via AbortController)
    window.addEventListener('resize', debounce(() => {
        const newRect = container.getBoundingClientRect();
        if (newRect.width !== width || newRect.height !== height) {
            width = newRect.width;
            height = newRect.height;
            svg.attr('viewBox', `0 0 ${width} ${height}`);
            if (simulation) {
                simulation.force('center', d3.forceCenter(width / 2, height / 2));
                simulation.alpha(FORCE_CONFIG.restartAlpha).restart();
            }
        }
    }, TIMING.debounce), { signal: resizeController.signal });
}

/**
 * Render main arena with nodes
 */
export function renderArena() {
    if (!svg) initArena();

    const { frequency, specialFrequency, zScores, gaps } = state.stats;
    const range = getNumberRange();
    const isLotto = state.lotteryType === 'lotto';

    // Calculate node properties
    const maxFreq = Math.max(...Object.values(frequency), 1);
    const maxSpecialFreq = Math.max(...Object.values(specialFrequency), 1);

    nodes = [];
    for (let i = 1; i <= range.main; i++) {
        const freq = frequency[i] || 0;
        const specialFreq = specialFrequency[i] || 0;
        const z = zScores[i] || 0;
        const gap = gaps[i] || 0;
        const status = getStatus(z);

        // Size based on main frequency
        const size = NODE_SIZE.min + (freq / maxFreq) * NODE_SIZE.range;

        // Depth based on special frequency (for lotto)
        // Higher special freq = deeper (lower y position)
        let depthFactor = 0;
        if (isLotto && maxSpecialFreq > 0) {
            depthFactor = specialFreq / maxSpecialFreq;
        }

        // Y position based on depth config
        const minY = height * DEPTH_CONFIG.minRatio;
        const maxY = height * DEPTH_CONFIG.maxRatio;
        const baseY = minY + depthFactor * (maxY - minY);

        nodes.push({
            id: i,
            number: i,
            frequency: freq,
            specialFrequency: specialFreq,
            zScore: z,
            gap: gap,
            status: status,
            size: size,
            baseY: baseY,
            x: width / 2 + (Math.random() - 0.5) * width * 0.6,
            y: baseY + (Math.random() - 0.5) * 50
        });
    }

    // Create force simulation (properly cleanup old simulation)
    if (simulation) {
        simulation.stop();
        simulation.on('tick', null); // Remove old tick listener to prevent memory leak
    }

    simulation = d3.forceSimulation(nodes)
        .force('charge', d3.forceManyBody().strength(FORCE_CONFIG.charge))
        .force('collide', d3.forceCollide().radius(d => d.size + FORCE_CONFIG.collide))
        .force('x', d3.forceX(width / 2).strength(FORCE_CONFIG.xStrength))
        .force('y', d3.forceY().y(d => d.baseY).strength(FORCE_CONFIG.yStrength))
        .on('tick', ticked);

    // Render nodes
    const nodesLayer = svg.select('.nodes-layer');
    nodesLayer.selectAll('*').remove();

    const nodeGroups = nodesLayer.selectAll('.node')
        .data(nodes)
        .enter()
        .append('g')
        .attr('class', 'node')
        .attr('cursor', 'pointer')
        .on('click', (event, d) => {
            event.stopPropagation();
            state.setSelectedNumber(d.number);
        })
        .on('mouseenter', (event, d) => showTooltip(d, event))
        .on('mouseleave', hideTooltip);

    // Shadow for depth effect
    nodeGroups.append('ellipse')
        .attr('class', 'node-shadow')
        .attr('rx', d => d.size * 0.8)
        .attr('ry', d => d.size * 0.3)
        .attr('fill', 'rgba(0, 0, 0, 0.3)')
        .attr('transform', d => `translate(0, ${d.size * 0.5})`);

    // Main circle
    nodeGroups.append('circle')
        .attr('class', 'node-circle')
        .attr('r', d => d.size)
        .attr('fill', d => getNodeColor(d))
        .attr('stroke', d => getNodeColor(d))
        .attr('stroke-width', VISUAL.strokeWidth.normal)
        .attr('opacity', d => VISUAL.opacity.normal + d.frequency / (state.stats.totalDraws || 1) * VISUAL.opacity.medium);

    // Number label
    nodeGroups.append('text')
        .attr('class', 'node-label')
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'central')
        .attr('fill', '#0f172a')
        .attr('font-size', d => Math.max(10, d.size * 0.6))
        .attr('font-weight', 'bold')
        .text(d => d.number);

    // Click on background to deselect
    svg.on('click', () => {
        state.clearSelection();
    });

    // Handle orbit zone for Super Lotto
    renderOrbitZone();
}

/**
 * Get node color based on status
 */
function getNodeColor(d) {
    switch (d.status.class) {
        case 'favorites': return COLORS.favorites;
        case 'outcasts': return COLORS.outcasts;
        default: return COLORS.normal;
    }
}

/**
 * Update node positions on tick
 */
function ticked() {
    const padding = 10; // 額外邊距
    svg.select('.nodes-layer')
        .selectAll('.node')
        .attr('transform', d => {
            // Constrain to bounds (加入 padding 和陰影空間)
            const margin = d.size + padding;
            d.x = Math.max(margin, Math.min(width - margin, d.x));
            d.y = Math.max(margin + height * DEPTH_CONFIG.waterSurface, Math.min(height - margin - 10, d.y));
            return `translate(${d.x}, ${d.y})`;
        });
}

/**
 * Render orbit zone for Super Lotto second zone
 */
function renderOrbitZone() {
    const orbitZone = document.getElementById('orbit-zone');
    const orbitContainer = document.getElementById('orbit-container');

    if (state.lotteryType !== 'super') {
        orbitZone.classList.add('hidden');
        return;
    }

    orbitZone.classList.remove('hidden');
    orbitContainer.innerHTML = '';

    const { specialFrequency } = state.stats;
    const maxFreq = Math.max(...Object.values(specialFrequency), 1);

    // Create SVG for orbit
    const orbitSvg = d3.select(orbitContainer)
        .append('svg')
        .attr('width', '100%')
        .attr('height', '100%');

    const orbitWidth = orbitContainer.clientWidth || 800;
    const orbitHeight = ORBIT_CONFIG.height;
    const padding = ORBIT_CONFIG.padding;

    orbitSvg.attr('viewBox', `0 0 ${orbitWidth} ${orbitHeight}`);

    // Orbit path - 縮小橢圓讓球不會超出邊界
    const centerX = orbitWidth / 2;
    const centerY = orbitHeight / 2;
    const radiusX = orbitWidth * ORBIT_CONFIG.radiusXRatio;
    const radiusY = (orbitHeight - padding * 2) / 2;

    orbitSvg.append('ellipse')
        .attr('cx', centerX)
        .attr('cy', centerY)
        .attr('rx', radiusX)
        .attr('ry', radiusY)
        .attr('fill', 'none')
        .attr('stroke', 'rgba(56, 189, 248, 0.2)')
        .attr('stroke-width', VISUAL.strokeWidth.thin)
        .attr('stroke-dasharray', VISUAL.dashArray);

    // Second zone balls (1-8)
    const secondZoneMax = LOTTERY_RANGES.super.special;
    const orbitNodes = [];
    for (let i = 1; i <= secondZoneMax; i++) {
        const freq = specialFrequency[i] || 0;
        const angle = ((i - 1) / secondZoneMax) * Math.PI * 2 - Math.PI / 2;
        const size = ORBIT_CONFIG.nodeSize.min + (freq / maxFreq) * ORBIT_CONFIG.nodeSize.range;

        orbitNodes.push({
            number: i,
            frequency: freq,
            x: centerX + Math.cos(angle) * radiusX,
            y: centerY + Math.sin(angle) * radiusY,
            size: size
        });
    }

    const orbitGroups = orbitSvg.selectAll('.orbit-node')
        .data(orbitNodes)
        .enter()
        .append('g')
        .attr('class', 'orbit-node')
        .attr('transform', d => `translate(${d.x}, ${d.y})`)
        .attr('cursor', 'pointer');

    orbitGroups.append('circle')
        .attr('r', d => d.size)
        .attr('fill', COLORS.normal)
        .attr('opacity', VISUAL.opacity.full);

    orbitGroups.append('text')
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'central')
        .attr('fill', '#0f172a')
        .attr('font-size', d => d.size * 0.7)
        .attr('font-weight', 'bold')
        .text(d => d.number);

    // Frequency labels - smart positioning based on orbit position
    // Upper half: label above ball, Lower half: label below ball
    orbitGroups.append('text')
        .attr('y', d => d.y < centerY ? -(d.size + ORBIT_CONFIG.labelOffset.above) : (d.size + ORBIT_CONFIG.labelOffset.below))
        .attr('text-anchor', 'middle')
        .attr('fill', 'rgba(148, 163, 184, 0.8)')
        .attr('font-size', VISUAL.fontSize.small)
        .text(d => `${d.frequency}次`);
}

/**
 * Show tooltip
 */
function showTooltip(d, event) {
    if (!tooltip) return;

    const isLotto = state.lotteryType === 'lotto';

    tooltip.querySelector('.tooltip-number').textContent = `#${d.number}`;

    const statusEl = tooltip.querySelector('.tooltip-status');
    statusEl.textContent = d.status.label;
    statusEl.className = `tooltip-status ${d.status.class}`;

    tooltip.querySelector('.main-count').textContent = `${d.frequency} 次`;

    const specialLabel = tooltip.querySelector('.stat-row:nth-child(2) .stat-label');
    specialLabel.textContent = isLotto ? '特別號' : '(不適用)';
    tooltip.querySelector('.special-count').textContent = isLotto ? `${d.specialFrequency} 次` : '-';

    tooltip.querySelector('.z-score').textContent = d.zScore.toFixed(2);
    tooltip.querySelector('.gap-count').textContent = `${d.gap} 期`;

    // Position tooltip
    const containerRect = document.getElementById('arena').getBoundingClientRect();
    let x = event.clientX - containerRect.left + 15;
    let y = event.clientY - containerRect.top - 10;

    // Keep in bounds
    if (x + 200 > containerRect.width) x = x - 220;
    if (y + 150 > containerRect.height) y = y - 160;

    tooltip.style.left = `${x}px`;
    tooltip.style.top = `${y}px`;
    tooltip.classList.remove('hidden');
}

/**
 * Hide tooltip
 */
function hideTooltip() {
    if (tooltip) {
        tooltip.classList.add('hidden');
    }
}

/**
 * Highlight selected number with spotlight and ripple
 */
export function highlightNode(num) {
    if (!svg) return;

    // Clear previous effects
    svg.select('.spotlight-layer').selectAll('*').remove();
    svg.select('.ripple-layer').selectAll('*').remove();
    svg.select('.labels-layer').selectAll('*').remove();

    // Reset all nodes
    svg.select('.nodes-layer')
        .selectAll('.node')
        .select('.node-circle')
        .attr('opacity', d => num ? (d.number === num ? VISUAL.opacity.solid : VISUAL.opacity.medium) : VISUAL.opacity.normal + d.frequency / (state.stats.totalDraws || 1) * VISUAL.opacity.medium);

    if (!num) return;

    // Find the node
    const node = nodes.find(n => n.number === num);
    if (!node) return;

    // Spotlight effect
    svg.select('.spotlight-layer')
        .append('ellipse')
        .attr('cx', node.x)
        .attr('cy', 0)
        .attr('rx', VISUAL.spotlightWidth)
        .attr('ry', height)
        .attr('fill', 'url(#spotlight-gradient)')
        .attr('opacity', 0)
        .transition()
        .duration(ANIMATION.spotlight)
        .attr('opacity', VISUAL.opacity.medium);

    // Add spotlight gradient if not exists
    let spotlightGrad = svg.select('defs').select('#spotlight-gradient');
    if (spotlightGrad.empty()) {
        spotlightGrad = svg.select('defs')
            .append('linearGradient')
            .attr('id', 'spotlight-gradient')
            .attr('x1', '0%')
            .attr('y1', '0%')
            .attr('x2', '0%')
            .attr('y2', '100%');

        spotlightGrad.append('stop')
            .attr('offset', '0%')
            .attr('stop-color', 'rgba(56, 189, 248, 0.5)');

        spotlightGrad.append('stop')
            .attr('offset', '100%')
            .attr('stop-color', 'transparent');
    }

    // Ripple effect
    for (let i = 0; i < 3; i++) {
        svg.select('.ripple-layer')
            .append('circle')
            .attr('cx', node.x)
            .attr('cy', node.y)
            .attr('r', node.size)
            .attr('fill', 'none')
            .attr('stroke', COLORS.ripple)
            .attr('stroke-width', VISUAL.strokeWidth.normal)
            .attr('opacity', VISUAL.opacity.full)
            .transition()
            .delay(i * TIMING.rippleDelay)
            .duration(ANIMATION.ripple)
            .attr('r', node.size + VISUAL.rippleExpand.single)
            .attr('opacity', 0)
            .remove();
    }

    // Show tooltip for selected node
    const nodeEl = svg.select('.nodes-layer')
        .selectAll('.node')
        .filter(d => d.number === num);

    if (!nodeEl.empty()) {
        const bbox = nodeEl.node().getBoundingClientRect();

        showTooltip(node, {
            clientX: bbox.left + bbox.width / 2,
            clientY: bbox.top
        });
    }
}

/**
 * Highlight a pair of numbers (for fate partners)
 */
export function highlightPair(num1, num2) {
    if (!svg) return;

    // Clear previous effects
    svg.select('.spotlight-layer').selectAll('*').remove();
    svg.select('.ripple-layer').selectAll('*').remove();
    svg.select('.labels-layer').selectAll('*').remove();

    // Reset all nodes - dim non-selected
    svg.select('.nodes-layer')
        .selectAll('.node')
        .select('.node-circle')
        .attr('opacity', d => (d.number === num1 || d.number === num2) ? VISUAL.opacity.solid : VISUAL.opacity.dim);

    if (!num1 || !num2) return;

    // Find both nodes
    const node1 = nodes.find(n => n.number === num1);
    const node2 = nodes.find(n => n.number === num2);
    if (!node1 || !node2) return;

    // Draw connection line
    svg.select('.ripple-layer')
        .append('line')
        .attr('x1', node1.x)
        .attr('y1', node1.y)
        .attr('x2', node1.x)
        .attr('y2', node1.y)
        .attr('stroke', COLORS.favorites)
        .attr('stroke-width', VISUAL.strokeWidth.thick)
        .attr('stroke-dasharray', VISUAL.dashArray)
        .attr('opacity', VISUAL.opacity.full)
        .transition()
        .duration(ANIMATION.connection)
        .attr('x2', node2.x)
        .attr('y2', node2.y);

    // Ripple effect on both nodes
    [node1, node2].forEach((node, idx) => {
        for (let i = 0; i < 2; i++) {
            svg.select('.ripple-layer')
                .append('circle')
                .attr('cx', node.x)
                .attr('cy', node.y)
                .attr('r', node.size)
                .attr('fill', 'none')
                .attr('stroke', COLORS.favorites)
                .attr('stroke-width', VISUAL.strokeWidth.normal)
                .attr('opacity', VISUAL.opacity.full)
                .transition()
                .delay(idx * 100 + i * TIMING.rippleDelay)
                .duration(ANIMATION.pairRipple)
                .attr('r', node.size + VISUAL.rippleExpand.pair)
                .attr('opacity', 0)
                .remove();
        }
    });

    // Smart label positioning: upper ball's label above, lower ball's label below
    const isNode1Above = node1.y < node2.y;
    const upperNode = isNode1Above ? node1 : node2;
    const lowerNode = isNode1Above ? node2 : node1;

    // Upper ball: label above
    svg.select('.labels-layer')
        .append('text')
        .attr('x', upperNode.x)
        .attr('y', upperNode.y - upperNode.size - VISUAL.labelOffset.above)
        .attr('text-anchor', 'middle')
        .attr('fill', '#94a3b8')
        .attr('font-size', VISUAL.fontSize.medium)
        .attr('font-weight', '500')
        .text(`${upperNode.frequency}次`);

    // Lower ball: label below
    svg.select('.labels-layer')
        .append('text')
        .attr('x', lowerNode.x)
        .attr('y', lowerNode.y + lowerNode.size + VISUAL.labelOffset.below)
        .attr('text-anchor', 'middle')
        .attr('fill', '#94a3b8')
        .attr('font-size', VISUAL.fontSize.medium)
        .attr('font-weight', '500')
        .text(`${lowerNode.frequency}次`);

    // Hide tooltip
    hideTooltip();
}

/**
 * Debounce utility
 */
function debounce(fn, delay) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => fn(...args), delay);
    };
}

/**
 * Update arena
 */
export function updateArena() {
    renderArena();
}
