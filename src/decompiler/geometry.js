// src/decompiler/geometry.js

/**
 * Represents a 2D axis-aligned bounding box (AABB)
 */
class BoundingBox {
    /**
     * @param {number} xMin Left coordinate
     * @param {number} yMin Top coordinate
     * @param {number} xMax Right coordinate
     * @param {number} yMax Bottom coordinate
     */
    constructor(xMin, yMin, xMax, yMax) {
        this.xMin = Math.min(xMin, xMax);
        this.yMin = Math.min(yMin, yMax);
        this.xMax = Math.max(xMin, xMax);
        this.yMax = Math.max(yMin, yMax);
    }

    get x() {
        return this.xMin;
    }

    get y() {
        return this.yMin;
    }

    get width() {
        return Math.max(0, this.xMax - this.xMin);
    }

    get height() {
        return Math.max(0, this.yMax - this.yMin);
    }

    get w() {
        return this.width;
    }

    get h() {
        return this.height;
    }

    get centerX() {
        return this.xMin + this.width / 2;
    }

    get centerY() {
        return this.yMin + this.height / 2;
    }

    get area() {
        return this.width * this.height;
    }

    /**
     * Checks if this bounding box completely encloses another box within epsilon tolerance
     * @param {BoundingBox} other
     * @param {number} [epsilon=3]
     * @returns {boolean}
     */
    contains(other, epsilon = 3) {
        if (!other) return false;
        return (
            this.xMin <= other.xMin + epsilon &&
            this.yMin <= other.yMin + epsilon &&
            this.xMax >= other.xMax - epsilon &&
            this.yMax >= other.yMax - epsilon
        );
    }

    /**
     * Checks if a 2D point is contained within this box
     * @param {number} px
     * @param {number} py
     * @param {number} [epsilon=0]
     * @returns {boolean}
     */
    containsPoint(px, py, epsilon = 0) {
        return (
            px >= this.xMin - epsilon &&
            px <= this.xMax + epsilon &&
            py >= this.yMin - epsilon &&
            py <= this.yMax + epsilon
        );
    }

    /**
     * Checks if this bounding box intersects/overlaps with another box
     * @param {BoundingBox} other
     * @param {number} [epsilon=0]
     * @returns {boolean}
     */
    intersects(other, epsilon = 0) {
        if (!other) return false;
        const overlapX = Math.min(this.xMax, other.xMax) - Math.max(this.xMin, other.xMin);
        const overlapY = Math.min(this.yMax, other.yMax) - Math.max(this.yMin, other.yMin);
        return overlapX > epsilon && overlapY > epsilon;
    }

    /**
     * Computes the intersection bounding box of two boxes, or null if disjoint
     * @param {BoundingBox} other
     * @returns {BoundingBox|null}
     */
    intersection(other) {
        if (!this.intersects(other)) return null;
        return new BoundingBox(
            Math.max(this.xMin, other.xMin),
            Math.max(this.yMin, other.yMin),
            Math.min(this.xMax, other.xMax),
            Math.min(this.yMax, other.yMax)
        );
    }

    /**
     * Computes the bounding box union enclosing both boxes
     * @param {BoundingBox} other
     * @returns {BoundingBox}
     */
    union(other) {
        if (!other) return new BoundingBox(this.xMin, this.yMin, this.xMax, this.yMax);
        return new BoundingBox(
            Math.min(this.xMin, other.xMin),
            Math.min(this.yMin, other.yMin),
            Math.max(this.xMax, other.xMax),
            Math.max(this.yMax, other.yMax)
        );
    }

    /**
     * Horizontal distance between two non-overlapping boxes (0 if overlapping)
     * @param {BoundingBox} other
     * @returns {number}
     */
    distanceX(other) {
        if (!other) return 0;
        return Math.max(0, Math.max(this.xMin - other.xMax, other.xMin - this.xMax));
    }

    /**
     * Vertical distance between two non-overlapping boxes (0 if overlapping)
     * @param {BoundingBox} other
     * @returns {number}
     */
    distanceY(other) {
        if (!other) return 0;
        return Math.max(0, Math.max(this.yMin - other.yMax, other.yMin - this.yMax));
    }

    /**
     * Checks if this box overlaps the boundary of a container (e.g. badge, close button)
     * @param {BoundingBox} containerBox
     * @param {number} [epsilon=3]
     * @returns {boolean}
     */
    overlapsBoundary(containerBox, epsilon = 3) {
        if (!containerBox) return false;
        if (!this.intersects(containerBox, -epsilon)) return false;
        // If it intersects, but is not fully contained within containerBox
        const fullyInside = containerBox.contains(this, epsilon);
        return !fullyInside;
    }

    /**
     * Extracts a BoundingBox from a Figma scene node
     * @param {object} node
     * @returns {BoundingBox}
     */
    static fromNode(node) {
        if (!node) return new BoundingBox(0, 0, 0, 0);

        let x = node.x !== undefined ? node.x : (node.transform?.m02 ?? 0);
        let y = node.y !== undefined ? node.y : (node.transform?.m12 ?? 0);
        const w = node.width !== undefined ? node.width : (node.size?.x ?? 0);
        const h = node.height !== undefined ? node.height : (node.size?.y ?? 0);

        if (node.x === undefined && node.transform) {
            const m00 = node.transform.m00 ?? 1;
            const m01 = node.transform.m01 ?? 0;
            const m10 = node.transform.m10 ?? 0;
            const m11 = node.transform.m11 ?? 1;
            if (Math.abs(m01) < 1e-4 && Math.abs(m10) < 1e-4) {
                if (m00 < 0) x += m00 * w;
                if (m11 < 0) y += m11 * h;
            }
        }

        return new BoundingBox(x, y, x + w, y + h);
    }

    /**
     * Computes the bounding box enclosing an array of BoundingBoxes or Figma nodes
     * @param {Array<BoundingBox|object>} items
     * @returns {BoundingBox}
     */
    static computeUnion(items) {
        if (!Array.isArray(items) || items.length === 0) {
            return new BoundingBox(0, 0, 0, 0);
        }

        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        for (const item of items) {
            const box = item instanceof BoundingBox ? item : BoundingBox.fromNode(item);
            if (box.xMin < minX) minX = box.xMin;
            if (box.yMin < minY) minY = box.yMin;
            if (box.xMax > maxX) maxX = box.xMax;
            if (box.yMax > maxY) maxY = box.yMax;
        }

        if (minX === Infinity) return new BoundingBox(0, 0, 0, 0);
        return new BoundingBox(minX, minY, maxX, maxY);
    }
}

/**
 * 1D Interval representation along a single axis
 */
class Interval {
    /**
     * @param {number} start
     * @param {number} end
     * @param {any} [data=null]
     */
    constructor(start, end, data = null) {
        this.start = Math.min(start, end);
        this.end = Math.max(start, end);
        this.data = data;
    }

    get length() {
        return Math.max(0, this.end - this.start);
    }

    get center() {
        return this.start + this.length / 2;
    }

    /**
     * @param {number} val
     * @param {number} [epsilon=0]
     * @returns {boolean}
     */
    contains(val, epsilon = 0) {
        return val >= this.start - epsilon && val <= this.end + epsilon;
    }

    /**
     * Checks if this interval overlaps or touches another interval within tolerance
     * @param {Interval} other
     * @param {number} [epsilon=0]
     * @returns {boolean}
     */
    overlaps(other, epsilon = 0) {
        if (!other) return false;
        return Math.max(this.start, other.start) <= Math.min(this.end, other.end) + epsilon;
    }

    /**
     * Distance to another interval (0 if overlapping)
     * @param {Interval} other
     * @returns {number}
     */
    distanceTo(other) {
        if (!other) return 0;
        return Math.max(0, Math.max(this.start - other.end, other.start - this.end));
    }

    /**
     * Unions with another interval
     * @param {Interval} other
     * @param {any} [mergedData=null]
     * @returns {Interval}
     */
    union(other, mergedData = null) {
        return new Interval(
            Math.min(this.start, other.start),
            Math.max(this.end, other.end),
            mergedData !== null ? mergedData : this.data
        );
    }
}

/**
 * Checks if two numbers are equal within epsilon tolerance
 * @param {number} a
 * @param {number} b
 * @param {number} [epsilon=3]
 * @returns {boolean}
 */
function fuzzyEqual(a, b, epsilon = 3) {
    return Math.abs(a - b) <= epsilon;
}

/**
 * Compares two numbers with epsilon tolerance
 * @param {number} a
 * @param {number} b
 * @param {number} [epsilon=3]
 * @returns {number} -1 if a < b, 1 if a > b, 0 if equal within epsilon
 */
function fuzzyCompare(a, b, epsilon = 3) {
    if (fuzzyEqual(a, b, epsilon)) return 0;
    return a < b ? -1 : 1;
}

/**
 * Groups numeric values into clusters where adjacent sorted values differ by <= epsilon
 * @param {Array<number>} values
 * @param {number} [epsilon=3]
 * @returns {Array<{ values: Array<number>, mean: number, median: number, min: number, max: number }>}
 */
function clusterValues(values, epsilon = 3) {
    if (!Array.isArray(values) || values.length === 0) return [];

    const sorted = [...values].sort((a, b) => a - b);
    const clusters = [];
    let currentCluster = [sorted[0]];

    for (let i = 1; i < sorted.length; i++) {
        const val = sorted[i];
        const prev = sorted[i - 1];
        if (val - prev <= epsilon) {
            currentCluster.push(val);
        } else {
            clusters.push(currentCluster);
            currentCluster = [val];
        }
    }
    clusters.push(currentCluster);

    return clusters.map(c => {
        const sum = c.reduce((acc, v) => acc + v, 0);
        const mean = sum / c.length;
        const mid = Math.floor(c.length / 2);
        const median = c.length % 2 !== 0 ? c[mid] : (c[mid - 1] + c[mid]) / 2;
        return {
            values: c,
            mean,
            median,
            min: c[0],
            max: c[c.length - 1]
        };
    });
}

/**
 * Merges overlapping or adjacent 1D intervals within epsilon tolerance
 * @param {Array<Interval>} intervals
 * @param {number} [epsilon=3]
 * @returns {Array<{ interval: Interval, items: Array<any> }>}
 */
function mergeIntervals(intervals, epsilon = 3) {
    if (!Array.isArray(intervals) || intervals.length === 0) return [];

    const sorted = [...intervals].sort((a, b) => a.start - b.start);
    const merged = [];

    let currentInterval = sorted[0];
    let currentItems = currentInterval.data !== null ? [currentInterval.data] : [];

    for (let i = 1; i < sorted.length; i++) {
        const next = sorted[i];
        // If current interval overlaps next interval within epsilon
        if (currentInterval.end + epsilon >= next.start) {
            currentInterval = new Interval(
                currentInterval.start,
                Math.max(currentInterval.end, next.end)
            );
            if (next.data !== null) {
                currentItems.push(next.data);
            }
        } else {
            merged.push({
                interval: currentInterval,
                items: currentItems
            });
            currentInterval = next;
            currentItems = next.data !== null ? [next.data] : [];
        }
    }

    merged.push({
        interval: currentInterval,
        items: currentItems
    });

    return merged;
}

/**
 * Finds empty gaps between merged intervals
 * @param {Array<{ interval: Interval }>} mergedBands
 * @param {number} [domainStart]
 * @param {number} [domainEnd]
 * @returns {Array<{ start: number, end: number, size: number }>}
 */
function findGaps(mergedBands, domainStart = null, domainEnd = null) {
    if (!Array.isArray(mergedBands) || mergedBands.length === 0) return [];

    const gaps = [];

    // Optional leading gap
    if (domainStart !== null && mergedBands[0].interval.start > domainStart) {
        const size = mergedBands[0].interval.start - domainStart;
        if (size > 0) {
            gaps.push({ start: domainStart, end: mergedBands[0].interval.start, size });
        }
    }

    // Gaps between adjacent bands
    for (let i = 0; i < mergedBands.length - 1; i++) {
        const currentEnd = mergedBands[i].interval.end;
        const nextStart = mergedBands[i + 1].interval.start;
        const size = nextStart - currentEnd;
        if (size > 0) {
            gaps.push({ start: currentEnd, end: nextStart, size });
        }
    }

    // Optional trailing gap
    if (domainEnd !== null && mergedBands[mergedBands.length - 1].interval.end < domainEnd) {
        const lastEnd = mergedBands[mergedBands.length - 1].interval.end;
        const size = domainEnd - lastEnd;
        if (size > 0) {
            gaps.push({ start: lastEnd, end: domainEnd, size });
        }
    }

    return gaps;
}

/**
 * Projects an array of Figma nodes onto the specified axis ('x' or 'y')
 * @param {Array<object>} nodes
 * @param {'x'|'y'} [axis='y']
 * @returns {Array<Interval>}
 */
function projectNodes(nodes, axis = 'y') {
    if (!Array.isArray(nodes)) return [];

    return nodes.map(node => {
        const box = BoundingBox.fromNode(node);
        if (axis === 'x') {
            return new Interval(box.xMin, box.xMax, node);
        }
        return new Interval(box.yMin, box.yMax, node);
    });
}

/**
 * Slices nodes along an axis into disjoint bands (using fuzzy tolerance epsilon)
 * @param {Array<object>} nodes
 * @param {'x'|'y'} [axis='y']
 * @param {number} [epsilon=3]
 * @returns {Array<{ interval: Interval, nodes: Array<object>, bounds: BoundingBox }>}
 */
function sliceAlongAxis(nodes, axis = 'y', epsilon = 3) {
    if (!Array.isArray(nodes) || nodes.length === 0) return [];

    const intervals = projectNodes(nodes, axis);
    const mergedBands = mergeIntervals(intervals, epsilon);

    return mergedBands.map(band => {
        const bandNodes = band.items;
        const bounds = BoundingBox.computeUnion(bandNodes);
        return {
            interval: band.interval,
            nodes: bandNodes,
            bounds
        };
    });
}

/**
 * Computes median value of an array of numbers
 * @param {Array<number>} numbers
 * @returns {number}
 */
function computeMedian(numbers) {
    if (!Array.isArray(numbers) || numbers.length === 0) return 0;
    const sorted = [...numbers].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

module.exports = {
    BoundingBox,
    Interval,
    fuzzyEqual,
    fuzzyCompare,
    clusterValues,
    mergeIntervals,
    findGaps,
    projectNodes,
    sliceAlongAxis,
    computeMedian
};
