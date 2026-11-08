import { PieceType } from './types';

export const COLS = 10;
export const ROWS = 20;

export const PIECE_TYPES: PieceType[] = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];

// Spawn orientations. The square is the only piece that does not need a 3x3 box.
export const SHAPES: Record<PieceType, number[][]> = {
    I: [
        [0, 0, 0, 0],
        [1, 1, 1, 1],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
    ],
    J: [
        [1, 0, 0],
        [1, 1, 1],
        [0, 0, 0],
    ],
    L: [
        [0, 0, 1],
        [1, 1, 1],
        [0, 0, 0],
    ],
    O: [
        [1, 1],
        [1, 1],
    ],
    S: [
        [0, 1, 1],
        [1, 1, 0],
        [0, 0, 0],
    ],
    T: [
        [0, 1, 0],
        [1, 1, 1],
        [0, 0, 0],
    ],
    Z: [
        [1, 1, 0],
        [0, 1, 1],
        [0, 0, 0],
    ],
};

// Flat poster inks, not screen neon.
export const COLORS: Record<PieceType, string> = {
    I: '#4d9aa6',
    J: '#4a6fae',
    L: '#d1963a',
    O: '#d34a34',
    S: '#6d8a4e',
    T: '#8d567b',
    Z: '#ad4a5c',
};

export function rotateMatrix(matrix: number[][], direction: 1 | -1): number[][] {
    const size = matrix.length;
    const rotated = matrix.map(row => row.slice());

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            if (direction === 1) {
                rotated[x][size - 1 - y] = matrix[y][x];
            } else {
                rotated[size - 1 - x][y] = matrix[y][x];
            }
        }
    }

    return rotated;
}
