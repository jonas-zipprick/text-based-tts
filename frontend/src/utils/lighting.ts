import type { Point, Wall } from '../../../shared';
import polygonClipping from 'polygon-clipping';

export type Segment = { a: Point; b: Point };

function getIntersection(ray: { start: Point; end: Point }, segment: Segment): Point | null {
    const r_px = ray.start.x;
    const r_py = ray.start.y;
    const r_dx = ray.end.x - ray.start.x;
    const r_dy = ray.end.y - ray.start.y;

    const s_px = segment.a.x;
    const s_py = segment.a.y;
    const s_dx = segment.b.x - segment.a.x;
    const s_dy = segment.b.y - segment.a.y;

    const r_mag = Math.sqrt(r_dx * r_dx + r_dy * r_dy);
    const s_mag = Math.sqrt(s_dx * s_dx + s_dy * s_dy);

    if (r_dx / r_mag === s_dx / s_mag && r_dy / r_mag === s_dy / s_mag) {
        return null; // Parallel
    }

    // Ray line: r_px + r_dx * T1 = x, r_py + r_dy * T1 = y
    // Segment line: s_px + s_dx * T2 = x, s_py + s_dy * T2 = y

    // Solve for T2 first (standard cross product approach)
    // Denominator = r_dx * s_dy - r_dy * s_dx (Cross product of direction vectors)
    // Actually, T2 formula used previously was correct for intersection of lines.

    const denom = s_dx * r_dy - s_dy * r_dx;
    if (denom === 0) return null; // Parallel

    const T2 = (r_dx * (s_py - r_py) + r_dy * (r_px - s_px)) / denom;
    // T1 = (s_px + s_dx * T2 - r_px) / r_dx  <-- This divides by zero if r_dx is 0.

    // Robust T1 calculation:
    // We can use the other equation: r_py + r_dy * T1 = s_py + s_dy * T2
    // T1 = (s_py + s_dy * T2 - r_py) / r_dy 
    // Use the one with larger magnitude denominator to avoid precision issues

    let T1;
    if (Math.abs(r_dx) > Math.abs(r_dy)) {
        T1 = (s_px + s_dx * T2 - r_px) / r_dx;
    } else {
        T1 = (s_py + s_dy * T2 - r_py) / r_dy;
    }

    if (T1 < 0) return null; // Behind ray start
    // Note: We don't limit T1 > 1 because ray is "infinite" length for checking direction, 
    // but in our usage we cap it at maxRadius later anyway, or we treat ray as segment.
    // However, logic says ray is segment start->end. So T1 should be <= 1?
    // The previous code checked T1 < 0 but not T1 > 1. 
    // This implies it treated ray as infinite line in one direction?
    // If we treat it as segment, we should check T1 <= 1.
    if (T1 > 1) return null; // Too far

    if (T2 < 0 || T2 > 1) return null; // Outside segment

    return {
        x: r_px + r_dx * T1,
        y: r_py + r_dy * T1,
    };
}

type Coord = [number, number];
type Poly = Coord[];

const PRECISION = 1000; // 3 decimal places
function round(n: number) {
    return Math.round(n * PRECISION) / PRECISION;
}

export function pointsToPoly(points: Point[]): Poly {
    // Round and deduplicate points to prevent degenerate edge errors in polygon-clipping
    const poly: Poly = [];
    if (points.length === 0) return poly;

    let lastX = NaN;
    let lastY = NaN;

    for (const p of points) {
        const x = round(p.x);
        const y = round(p.y);

        if (x !== lastX || y !== lastY) {
            poly.push([x, y]);
            lastX = x;
            lastY = y;
        }
    }

    // Check last point vs first point for closure (optional, but good for loop)
    if (poly.length > 1) {
        const first = poly[0];
        const last = poly[poly.length - 1];
        if (first[0] === last[0] && first[1] === last[1]) {
            poly.pop();
        }
    }

    // Polygon must have at least 3 points to be valid for clipping?
    // polygon-clipping might handle less, but geometrically it implies area.
    return poly;
}

export function polyToPoints(poly: Poly): Point[] {
    const points = poly.map(p => ({ x: p[0], y: p[1] }));
    if (points.length > 1) {
        const first = points[0];
        const last = points[points.length - 1];
        if (first.x === last.x && first.y === last.y) {
            points.pop();
        }
    }
    return points;
}

export function unionPolygons(polys: Point[][]): Point[][] {
    if (polys.length === 0) return [];
    try {
        const rings = polys.map(pointsToPoly).filter(p => p.length >= 3);
        if (rings.length === 0) return [];

        // polygon-clipping expects Polygon = [OuterRing, Hole1, Hole2, ...]
        // and union(...polygons) where each arg is a Polygon.
        // We have light shapes which are simple rings (no holes).
        // So each light should be: [ ringCoords ] (a Polygon with just an outer ring)
        // And we pass them as separate arguments or as an array of Polygons.
        // polygon-clipping.union(poly1, poly2, ...) or union([poly1, poly2, ...])
        // Actually, looking at types: union(...polygons: MultiPolygon[]): MultiPolygon
        // MultiPolygon = Polygon[] = Ring[][]
        // So each input is already a Polygon[] (MultiPolygon).
        // We need: polygonClipping.union([ring1], [ring2]) where [ring1] is Polygon with outer ring.

        // CORRECT: Each light ring should be wrapped: [[ringCoords]] = MultiPolygon with 1 Polygon
        // Then spread them: union(...multiPolys)
        const multiPolys = rings.map(ring => [[ring]]); // [ MultiPolygon, MultiPolygon, ... ]

        const result = polygonClipping.union(...multiPolys as any);
        // Result: MultiPolygon = [ [OuterRing, Hole...], ... ]
        // Flatten to just outer rings
        return result.map(poly => polyToPoints(poly[0]));
    } catch (e) {
        console.warn("Polygon union failed", e);
        return polys;
    }
}

export function intersectPolygons(poly1: Point[], poly2: Point[][]): Point[][] {
    if (poly2.length === 0) return [];
    try {
        const p1Ring = pointsToPoly(poly1);
        if (p1Ring.length < 3) return [];

        const p2Rings = poly2.map(pointsToPoly).filter(p => p.length >= 3);
        if (p2Rings.length === 0) return [];

        // Union all light polygons first
        const lightMultiPolys = p2Rings.map(ring => [[ring]]);
        const lightsUnion = polygonClipping.union(...lightMultiPolys as any);

        // Intersect LoS polygon with union of lights
        // LoS is a single polygon: [[p1Ring]]
        const losMultiPoly = [[p1Ring]];
        const result = polygonClipping.intersection(losMultiPoly as any, lightsUnion);

        return result.map(poly => polyToPoints(poly[0]));
    } catch (e) {
        console.warn("Polygon intersection failed", e);
        return [poly1];
    }
}

export function calculateVisibilityPolygon(origin: Point, walls: Wall[], maxRadius: number): Point[] {
    const uniquePoints: Point[] = [];

    // Add walls endpoints
    for (const wall of walls) {
        uniquePoints.push(wall.start);
        uniquePoints.push(wall.end);
    }

    // Also add viewport/bounding box corners if we want (optional)
    // For now, relies on maxRadius to cast rays far enough

    const angles: number[] = [];
    for (const p of uniquePoints) {
        const angle = Math.atan2(p.y - origin.y, p.x - origin.x);
        angles.push(angle - 0.0001, angle, angle + 0.0001);
    }

    // Add base circle angles to ensure roundness (and valid polygon if no walls)
    // 36 steps = every 10 degrees. Use -PI to PI range to match atan2.
    const step = (Math.PI * 2) / 36;
    for (let i = 0; i < 36; i++) {
        angles.push(-Math.PI + (i * step));
    }

    const normalizeAngle = (a: number) => {
        a = a % (2 * Math.PI);
        if (a > Math.PI) a -= 2 * Math.PI;
        if (a <= -Math.PI) a += 2 * Math.PI;
        return a;
    };

    // Sort angles
    // Normalize first to ensure correct sorting around the wrap-point
    angles.sort((a, b) => normalizeAngle(a) - normalizeAngle(b));

    const polygon: Point[] = [];

    for (const angle of angles) {
        const dx = Math.cos(angle);
        const dy = Math.sin(angle);

        const rayEnd = {
            x: origin.x + dx * maxRadius,
            y: origin.y + dy * maxRadius
        };

        let closestIntersect: Point | null = null;
        let minDist = Infinity;

        // Check intersection with all walls
        for (const wall of walls) {
            // Wall needs to be Segment
            const segment: Segment = { a: wall.start, b: wall.end };
            const intersect = getIntersection({ start: origin, end: rayEnd }, segment);
            if (intersect) {
                const dist = Math.sqrt(Math.pow(intersect.x - origin.x, 2) + Math.pow(intersect.y - origin.y, 2));
                if (dist < minDist) {
                    minDist = dist;
                    closestIntersect = intersect;
                }
            }
        }

        // Also check intersection with "maxRadius" circle logic if needed, or just cap it.
        // Ideally we intersect with Map Boundaries.
        // If no wall hit, use rayEnd?
        if (!closestIntersect) {
            closestIntersect = rayEnd;
        }

        polygon.push(closestIntersect);
    }

    return polygon;
}

export function isPointInPolygon(point: Point, polygon: Point[]): boolean {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].x, yi = polygon[i].y;
        const xj = polygon[j].x, yj = polygon[j].y;

        const intersect = ((yi > point.y) !== (yj > point.y))
            && (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}
