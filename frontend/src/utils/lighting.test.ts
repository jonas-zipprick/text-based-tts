import { describe, it, expect } from 'vitest';
import {
    pointsToPoly,
    polyToPoints,
    unionPolygons,
    intersectPolygons,
    isPointInPolygon,
    calculateVisibilityPolygon
} from './lighting';
import type { Point, Wall } from '../../../shared';

describe('lighting utils', () => {
    describe('pointsToPoly / polyToPoints', () => {
        it('should round and deduplicate points', () => {
            const points: Point[] = [
                { x: 10.0001, y: 20.0001 },
                { x: 10.0002, y: 20.0002 }, // Should be deduplicated after rounding
                { x: 30.1, y: 40.1 }
            ];
            const poly = pointsToPoly(points);
            expect(poly).toEqual([[10, 20], [30.1, 40.1]]);
        });

        it('should handle conversion back and forth', () => {
            const poly: [number, number][] = [[0, 0], [10, 0], [10, 10], [0, 10]];
            const points = polyToPoints(poly);
            expect(points).toEqual([
                { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }
            ]);
            const backToPoly = pointsToPoly(points);
            expect(backToPoly).toEqual(poly);
        });
    });

    describe('isPointInPolygon', () => {
        const square: Point[] = [
            { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }
        ];

        it('should return true for points inside', () => {
            expect(isPointInPolygon({ x: 50, y: 50 }, square)).toBe(true);
            expect(isPointInPolygon({ x: 1, y: 1 }, square)).toBe(true);
        });

        it('should return false for points outside', () => {
            expect(isPointInPolygon({ x: -1, y: 50 }, square)).toBe(false);
            expect(isPointInPolygon({ x: 101, y: 50 }, square)).toBe(false);
            expect(isPointInPolygon({ x: 50, y: -1 }, square)).toBe(false);
            expect(isPointInPolygon({ x: 50, y: 101 }, square)).toBe(false);
        });

        it('should handle concave shapes', () => {
            const uShape: Point[] = [
                { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 },
                { x: 0, y: 80 }, { x: 80, y: 80 }, { x: 80, y: 20 }, { x: 0, y: 20 }
            ];
            expect(isPointInPolygon({ x: 90, y: 50 }, uShape)).toBe(true);
            expect(isPointInPolygon({ x: 50, y: 50 }, uShape)).toBe(false); // Inside the "U" cutout
        });
    });

    describe('unionPolygons', () => {
        it('should merge overlapping squares', () => {
            const square1: Point[] = [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }];
            const square2: Point[] = [{ x: 10, y: 10 }, { x: 30, y: 10 }, { x: 30, y: 30 }, { x: 10, y: 30 }];

            const result = unionPolygons([square1, square2]);
            expect(result.length).toBe(1);
            // The result should have 8 points (L-shape-ish)
            expect(result[0].length).toBe(8);
        });

        it('should return separate polygons for non-overlapping shapes', () => {
            const square1: Point[] = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
            const square2: Point[] = [{ x: 20, y: 20 }, { x: 30, y: 20 }, { x: 30, y: 30 }, { x: 20, y: 30 }];

            const result = unionPolygons([square1, square2]);
            expect(result.length).toBe(2);
        });
    });

    describe('intersectPolygons', () => {
        it('should clip LoS to lit areas', () => {
            // Square LoS (0,0) to (100,100)
            const los: Point[] = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
            // Single light overlapping the corner (50,50) to (150,150)
            const light: Point[] = [{ x: 50, y: 50 }, { x: 150, y: 50 }, { x: 150, y: 150 }, { x: 50, y: 150 }];

            const result = intersectPolygons(los, [light]);
            expect(result.length).toBe(1);
            // Result should be the square (50,50) to (100,100)
            expect(result[0].length).toBe(4);
            const sorted = result[0].sort((a, b) => (a.x - b.x) || (a.y - b.y));
            expect(sorted[0]).toEqual({ x: 50, y: 50 });
            expect(sorted[3]).toEqual({ x: 100, y: 100 });
        });

        it('should return empty if no lights overlap LoS', () => {
            const los: Point[] = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
            const light: Point[] = [{ x: 50, y: 50 }, { x: 60, y: 50 }, { x: 60, y: 60 }, { x: 50, y: 60 }];
            const result = intersectPolygons(los, [light]);
            expect(result.length).toBe(0);
        });
    });

    describe('calculateVisibilityPolygon', () => {
        it('should create a circle-like polygon in empty space', () => {
            const origin = { x: 0, y: 0 };
            const walls: Wall[] = [];
            const radius = 100;

            const poly = calculateVisibilityPolygon(origin, walls, radius);
            expect(poly.length).toBeGreaterThan(30); // 36 base steps
            poly.forEach(p => {
                const dist = Math.sqrt(p.x * p.x + p.y * p.y);
                expect(dist).toBeCloseTo(radius, 1);
            });
        });

        it('should be blocked by a wall', () => {
            const origin = { x: 0, y: 0 };
            const walls: Wall[] = [
                { start: { x: 50, y: -50 }, end: { x: 50, y: 50 } }
            ];
            const radius = 100;

            const poly = calculateVisibilityPolygon(origin, walls, radius);

            // Cast a ray at 0 degrees (straight towards the wall)
            // It should be hit at x=50
            const rightPoint = poly.find(p => Math.abs(p.y) < 0.1 && p.x > 0);
            expect(rightPoint?.x).toBeCloseTo(50, 1);

            // Cast a ray at 180 degrees (away from wall)
            // It should be at radius 100
            const leftPoint = poly.find(p => Math.abs(p.y) < 0.1 && p.x < 0);
            expect(leftPoint?.x).toBeCloseTo(-100, 1);
        });
    });
});
