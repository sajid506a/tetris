export type PieceType = 'I' | 'J' | 'L' | 'O' | 'S' | 'T' | 'Z';

export type BoardCell = PieceType | null;

export type GameState = 'IDLE' | 'RUNNING' | 'PAUSED' | 'OVER';

export interface ActivePiece {
    type: PieceType;
    matrix: number[][];
    x: number;
    y: number;
}
