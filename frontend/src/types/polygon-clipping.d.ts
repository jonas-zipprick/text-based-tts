declare module 'polygon-clipping' {
    type Pair = [number, number];
    type Poly = Pair[];
    type MultiPoly = Poly[];

    export function union(polys: MultiPoly[]): MultiPoly;
    export function intersection(poly1: MultiPoly[], poly2: MultiPoly[]): MultiPoly;
    export function xor(poly1: MultiPoly[], poly2: MultiPoly[]): MultiPoly;
    export function difference(poly1: MultiPoly[], poly2: MultiPoly[]): MultiPoly;
}
