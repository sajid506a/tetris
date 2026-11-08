import { ActivePiece, BoardCell, GameState, PieceType } from './types';
import { COLS, ROWS, SHAPES, COLORS, PIECE_TYPES, rotateMatrix } from './pieces';

const NEXT_VISIBLE = 3;
const LINE_SCORES = [0, 100, 300, 500, 800];
const BEST_KEY = 'tetris_poster_best';
const WALL_KICKS = [0, -1, 1, -2, 2];

// Logical canvas sizes; the backing store is scaled by device pixel ratio.
const BOARD_W = COLS * 30;
const BOARD_H = ROWS * 30;
const NEXT_W = 120;
const NEXT_H = 162;
const HOLD_W = 120;
const HOLD_H = 66;
const NEXT_SLOT = 54;
const PREVIEW_CELL = 13;

const INK = '#12100c';
const PAPER = '#f4efe4';

function emptyBoard(): BoardCell[][] {
    return Array.from({ length: ROWS }, () => Array<BoardCell>(COLS).fill(null));
}

class TetrisGame {
    private boardCanvas: HTMLCanvasElement;
    private boardCtx: CanvasRenderingContext2D;
    private nextCanvas: HTMLCanvasElement;
    private nextCtx: CanvasRenderingContext2D;
    private holdCanvas: HTMLCanvasElement;
    private holdCtx: CanvasRenderingContext2D;

    private scoreEl: HTMLElement;
    private bestEl: HTMLElement;
    private linesEl: HTMLElement;
    private levelEl: HTMLElement;
    private finalEl: HTMLElement;
    private statusEl: HTMLElement;

    private startOverlay: HTMLElement;
    private pauseOverlay: HTMLElement;
    private overOverlay: HTMLElement;

    private board: BoardCell[][] = emptyBoard();
    private piece: ActivePiece | null = null;
    private queue: PieceType[] = [];
    private bag: PieceType[] = [];
    private held: PieceType | null = null;
    private holdLocked = false;

    private state: GameState = 'IDLE';
    private score = 0;
    private best = 0;
    private lines = 0;
    private level = 1;

    private dropElapsed = 0;
    private lastFrame = 0;

    private readonly cell = 30;

    constructor() {
        this.boardCanvas = document.getElementById('board') as HTMLCanvasElement;
        this.nextCanvas = document.getElementById('next') as HTMLCanvasElement;
        this.holdCanvas = document.getElementById('hold') as HTMLCanvasElement;

        this.boardCtx = this.setupCanvas(this.boardCanvas, BOARD_W, BOARD_H);
        this.nextCtx = this.setupCanvas(this.nextCanvas, NEXT_W, NEXT_H);
        this.holdCtx = this.setupCanvas(this.holdCanvas, HOLD_W, HOLD_H);

        this.scoreEl = document.getElementById('score')!;
        this.bestEl = document.getElementById('best')!;
        this.linesEl = document.getElementById('lines')!;
        this.levelEl = document.getElementById('level')!;
        this.finalEl = document.getElementById('final-line')!;
        this.statusEl = document.getElementById('status')!;

        this.startOverlay = document.getElementById('start-overlay')!;
        this.pauseOverlay = document.getElementById('pause-overlay')!;
        this.overOverlay = document.getElementById('over-overlay')!;

        this.loadBest();
        this.bindControls();
        this.updateStats();
        this.draw();
        requestAnimationFrame(this.loop);
    }

    private setupCanvas(canvas: HTMLCanvasElement, width: number, height: number): CanvasRenderingContext2D {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        const ctx = canvas.getContext('2d')!;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        return ctx;
    }

    private bindControls() {
        document.getElementById('start-btn')!.addEventListener('click', (event) => {
            (event.currentTarget as HTMLElement).blur();
            this.start();
        });
        document.getElementById('resume-btn')!.addEventListener('click', (event) => {
            (event.currentTarget as HTMLElement).blur();
            this.resume();
        });
        document.getElementById('restart-btn')!.addEventListener('click', (event) => {
            (event.currentTarget as HTMLElement).blur();
            this.start();
        });

        const touchPause = document.getElementById('touch-pause');
        touchPause!.addEventListener('click', () => {
            if (this.state === 'RUNNING') this.pause();
            else if (this.state === 'PAUSED') this.resume();
        });
        document.getElementById('touch-restart')!.addEventListener('click', () => {
            this.start();
        });

        window.addEventListener('keydown', this.onKeyDown);
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && this.state === 'RUNNING') this.pause();
        });

        this.bindTouch();
    }

    // Touch is a small courtesy for phones: drag to move or drop, tap to rotate.
    private bindTouch() {
        const target = this.boardCanvas;
        let lastX = 0;
        let lastY = 0;
        let startTime = 0;
        let dragged = false;
        const step = 22;

        target.addEventListener(
            'touchstart',
            (event) => {
                if (event.touches.length !== 1) return;
                lastX = event.touches[0].clientX;
                lastY = event.touches[0].clientY;
                startTime = performance.now();
                dragged = false;
            },
            { passive: true }
        );

        target.addEventListener(
            'touchmove',
            (event) => {
                if (this.state !== 'RUNNING' || !this.piece || event.touches.length !== 1) return;
                event.preventDefault();

                const touch = event.touches[0];
                const dx = touch.clientX - lastX;
                const dy = touch.clientY - lastY;

                if (Math.abs(dx) >= step && Math.abs(dx) > Math.abs(dy)) {
                    this.move(dx > 0 ? 1 : -1);
                    lastX = touch.clientX;
                    lastY = touch.clientY;
                    dragged = true;
                } else if (dy >= step) {
                    this.softDrop();
                    lastX = touch.clientX;
                    lastY = touch.clientY;
                    dragged = true;
                }
            },
            { passive: false }
        );

        target.addEventListener('touchend', () => {
            if (this.state !== 'RUNNING' || !this.piece) return;
            if (!dragged && performance.now() - startTime < 350) {
                this.rotate(1);
            }
        });
    }

    private onKeyDown = (event: KeyboardEvent) => {
        const handled = [
            'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
            'KeyA', 'KeyD', 'KeyW', 'KeyS', 'KeyZ', 'KeyX',
            'KeyC', 'KeyP', 'KeyR', 'Space', 'Enter', 'Escape',
        ];
        if (!handled.includes(event.code)) return;
        event.preventDefault();

        if (this.state === 'IDLE' || this.state === 'OVER') {
            if (event.code === 'Enter' || event.code === 'Space' || event.code === 'KeyR') {
                this.start();
            }
            return;
        }

        if (event.code === 'KeyP' || event.code === 'Escape') {
            if (this.state === 'RUNNING') this.pause();
            else this.resume();
            return;
        }

        if (event.code === 'KeyR') {
            this.start();
            return;
        }

        if (this.state !== 'RUNNING' || !this.piece) return;

        switch (event.code) {
            case 'ArrowLeft':
            case 'KeyA':
                this.move(-1);
                break;
            case 'ArrowRight':
            case 'KeyD':
                this.move(1);
                break;
            case 'ArrowDown':
            case 'KeyS':
                this.softDrop();
                break;
            case 'ArrowUp':
            case 'KeyW':
            case 'KeyX':
                if (!event.repeat) this.rotate(1);
                break;
            case 'KeyZ':
                if (!event.repeat) this.rotate(-1);
                break;
            case 'Space':
                if (!event.repeat) this.hardDrop();
                break;
            case 'KeyC':
                if (!event.repeat) this.holdPiece();
                break;
        }
    };

    // ---------------------------------------------------------------- lifecycle

    private start() {
        this.board = emptyBoard();
        this.queue = [];
        this.bag = [];
        this.held = null;
        this.holdLocked = false;
        this.score = 0;
        this.lines = 0;
        this.level = 1;
        this.dropElapsed = 0;
        this.state = 'RUNNING';
        this.hideOverlays();
        this.spawn();
        this.updateStats();
        this.setTouchPauseLabel('Pause');
        this.announce('Game started.');
    }

    private pause() {
        if (this.state !== 'RUNNING') return;
        this.state = 'PAUSED';
        this.showOverlay(this.pauseOverlay);
        this.setTouchPauseLabel('Resume');
        this.announce('Paused.');
    }

    private resume() {
        if (this.state !== 'PAUSED') return;
        this.state = 'RUNNING';
        this.hideOverlays();
        this.setTouchPauseLabel('Pause');
        this.announce('Resumed.');
    }

    private setTouchPauseLabel(label: string) {
        const button = document.getElementById('touch-pause');
        if (button) button.textContent = label;
    }

    private gameOver() {
        this.state = 'OVER';
        this.piece = null;
        if (this.score > this.best) {
            this.best = this.score;
            localStorage.setItem(BEST_KEY, String(this.best));
        }
        this.updateStats();
        this.finalEl.textContent = `${this.format(this.score)} points · ${this.lines} lines · level ${this.level}`;
        this.setTouchPauseLabel('Pause');
        this.showOverlay(this.overOverlay);
        this.announce(`Game over. ${this.score} points.`);
    }

    private showOverlay(overlay: HTMLElement) {
        for (const el of [this.startOverlay, this.pauseOverlay, this.overOverlay]) {
            el.classList.toggle('hidden', el !== overlay);
        }
    }

    private hideOverlays() {
        for (const el of [this.startOverlay, this.pauseOverlay, this.overOverlay]) {
            el.classList.add('hidden');
        }
    }

    // ------------------------------------------------------------------- pieces

    private takeFromBag(): PieceType {
        if (this.bag.length === 0) {
            this.bag = [...PIECE_TYPES];
            for (let i = this.bag.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
            }
        }
        return this.bag.pop()!;
    }

    private spawn() {
        while (this.queue.length < NEXT_VISIBLE + 1) {
            this.queue.push(this.takeFromBag());
        }

        const type = this.queue.shift()!;
        const matrix = SHAPES[type].map((row) => row.slice());
        const piece: ActivePiece = {
            type,
            matrix,
            x: Math.floor((COLS - matrix.length) / 2),
            y: 0,
        };

        this.piece = piece;
        this.dropElapsed = 0;

        if (this.collides(piece)) {
            this.gameOver();
        }
    }

    private collides(piece: ActivePiece, dx = 0, dy = 0, matrix = piece.matrix): boolean {
        for (let y = 0; y < matrix.length; y++) {
            for (let x = 0; x < matrix[y].length; x++) {
                if (!matrix[y][x]) continue;

                const nx = piece.x + x + dx;
                const ny = piece.y + y + dy;

                if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
                if (ny >= 0 && this.board[ny][nx]) return true;
            }
        }
        return false;
    }

    private move(dx: number) {
        if (!this.piece || this.collides(this.piece, dx, 0)) return;
        this.piece.x += dx;
    }

    private rotate(direction: 1 | -1) {
        if (!this.piece) return;

        const rotated = rotateMatrix(this.piece.matrix, direction);
        for (const kick of WALL_KICKS) {
            if (!this.collides(this.piece, kick, 0, rotated)) {
                this.piece.matrix = rotated;
                this.piece.x += kick;
                return;
            }
        }
    }

    private softDrop() {
        if (!this.piece) return;
        if (!this.collides(this.piece, 0, 1)) {
            this.piece.y++;
            this.score += 1;
            this.updateStats();
        }
        this.dropElapsed = 0;
    }

    private hardDrop() {
        if (!this.piece) return;

        let distance = 0;
        while (!this.collides(this.piece, 0, 1)) {
            this.piece.y++;
            distance++;
        }

        this.score += distance * 2;
        this.lock();
    }

    private holdPiece() {
        if (!this.piece || this.holdLocked) return;

        const current = this.piece.type;
        if (this.held === null) {
            this.held = current;
            this.spawn();
        } else {
            const swap = this.held;
            this.held = current;
            this.queue.unshift(swap);
            this.spawn();
        }

        this.holdLocked = true;
        this.announce(`Holding ${this.held} piece.`);
    }

    private tick() {
        if (!this.piece) return;
        if (this.collides(this.piece, 0, 1)) {
            this.lock();
        } else {
            this.piece.y++;
        }
    }

    private lock() {
        const piece = this.piece;
        if (!piece) return;

        for (let y = 0; y < piece.matrix.length; y++) {
            for (let x = 0; x < piece.matrix[y].length; x++) {
                if (!piece.matrix[y][x]) continue;
                const by = piece.y + y;
                const bx = piece.x + x;
                if (by >= 0) this.board[by][bx] = piece.type;
            }
        }

        this.piece = null;
        this.holdLocked = false;
        this.clearLines();
        this.updateStats();
        this.spawn();
    }

    private clearLines() {
        const kept = this.board.filter((row) => row.some((cell) => cell === null));
        const cleared = ROWS - kept.length;
        if (cleared === 0) return;

        while (kept.length < ROWS) {
            kept.unshift(Array<BoardCell>(COLS).fill(null));
        }
        this.board = kept;

        this.score += LINE_SCORES[cleared] * this.level;
        this.lines += cleared;

        const nextLevel = Math.floor(this.lines / 10) + 1;
        if (nextLevel !== this.level) {
            this.level = nextLevel;
            this.announce(`Level ${this.level}.`);
        }

        this.announce(
            cleared === 4
                ? 'Four lines. Well done.'
                : `${cleared} line${cleared === 1 ? '' : 's'} cleared.`
        );
    }

    // ------------------------------------------------------------------ render

    private get gravity(): number {
        return Math.max(90, 800 - (this.level - 1) * 65);
    }

    private loop = (time: number) => {
        const dt = this.lastFrame ? Math.min(100, time - this.lastFrame) : 0;
        this.lastFrame = time;

        if (this.state === 'RUNNING' && this.piece) {
            this.dropElapsed += dt;
            while (this.dropElapsed >= this.gravity && this.state === 'RUNNING') {
                this.dropElapsed -= this.gravity;
                this.tick();
            }
        }

        this.draw();
        requestAnimationFrame(this.loop);
    };

    private draw() {
        this.drawBoard();
        this.drawNext();
        this.drawHold();
    }

    private paintBlock(
        ctx: CanvasRenderingContext2D,
        x: number,
        y: number,
        size: number,
        color: string,
        lineWidth = 2
    ) {
        ctx.fillStyle = color;
        ctx.fillRect(x, y, size, size);

        ctx.strokeStyle = 'rgba(12, 10, 7, 0.55)';
        ctx.lineWidth = lineWidth;
        ctx.strokeRect(x + lineWidth / 2, y + lineWidth / 2, size - lineWidth, size - lineWidth);

        // A single light edge gives the flat fill a printed, letterpress feel
        // without turning it into a gradient.
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
        ctx.lineWidth = 1;
        const inset = Math.max(3, lineWidth + 1);
        ctx.beginPath();
        ctx.moveTo(x + inset, y + size - inset);
        ctx.lineTo(x + inset, y + inset);
        ctx.lineTo(x + size - inset, y + inset);
        ctx.stroke();
    }

    private drawBoard() {
        const ctx = this.boardCtx;
        const width = COLS * this.cell;
        const height = ROWS * this.cell;

        ctx.fillStyle = INK;
        ctx.fillRect(0, 0, width, height);

        ctx.strokeStyle = 'rgba(244, 239, 228, 0.07)';
        ctx.lineWidth = 1;
        for (let x = 1; x < COLS; x++) {
            const px = x * this.cell + 0.5;
            ctx.beginPath();
            ctx.moveTo(px, 0);
            ctx.lineTo(px, height);
            ctx.stroke();
        }
        for (let y = 1; y < ROWS; y++) {
            const py = y * this.cell + 0.5;
            ctx.beginPath();
            ctx.moveTo(0, py);
            ctx.lineTo(width, py);
            ctx.stroke();
        }

        for (let y = 0; y < ROWS; y++) {
            for (let x = 0; x < COLS; x++) {
                const type = this.board[y][x];
                if (!type) continue;
                this.paintBlock(ctx, x * this.cell, y * this.cell, this.cell, COLORS[type]);
            }
        }

        if (this.piece) {
            this.drawGhost(ctx);

            const { matrix, x, y, type } = this.piece;
            for (let row = 0; row < matrix.length; row++) {
                for (let col = 0; col < matrix[row].length; col++) {
                    if (!matrix[row][col]) continue;
                    const cellY = y + row;
                    if (cellY < 0) continue;
                    this.paintBlock(
                        ctx,
                        (x + col) * this.cell,
                        cellY * this.cell,
                        this.cell,
                        COLORS[type]
                    );
                }
            }
        }
    }

    private drawGhost(ctx: CanvasRenderingContext2D) {
        if (!this.piece) return;

        let drop = 0;
        while (!this.collides(this.piece, 0, drop + 1)) drop++;
        if (drop === 0) return;

        ctx.save();
        ctx.strokeStyle = 'rgba(244, 239, 228, 0.28)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 4]);

        const { matrix, x, y } = this.piece;
        for (let row = 0; row < matrix.length; row++) {
            for (let col = 0; col < matrix[row].length; col++) {
                if (!matrix[row][col]) continue;
                const cellY = y + row + drop;
                if (cellY < 0) continue;
                ctx.strokeRect(
                    (x + col) * this.cell + 2,
                    cellY * this.cell + 2,
                    this.cell - 4,
                    this.cell - 4
                );
            }
        }

        ctx.restore();
    }

    private previewQueue(): PieceType[] {
        const preview = this.queue.slice(0, NEXT_VISIBLE);
        while (preview.length < NEXT_VISIBLE) {
            preview.push(this.takeFromBag());
        }
        return preview;
    }

    private matrixBounds(matrix: number[][]) {
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -1;
        let maxY = -1;

        for (let y = 0; y < matrix.length; y++) {
            for (let x = 0; x < matrix[y].length; x++) {
                if (!matrix[y][x]) continue;
                minX = Math.min(minX, x);
                minY = Math.min(minY, y);
                maxX = Math.max(maxX, x);
                maxY = Math.max(maxY, y);
            }
        }

        return { minX, minY, maxX, maxY, width: maxX - minX + 1, height: maxY - minY + 1 };
    }

    private drawPreview(
        ctx: CanvasRenderingContext2D,
        type: PieceType | null,
        centerX: number,
        centerY: number
    ) {
        if (!type) return;

        const matrix = SHAPES[type];
        const bounds = this.matrixBounds(matrix);
        const offsetX = centerX - (bounds.width * PREVIEW_CELL) / 2 - bounds.minX * PREVIEW_CELL;
        const offsetY = centerY - (bounds.height * PREVIEW_CELL) / 2 - bounds.minY * PREVIEW_CELL;

        for (let y = 0; y < matrix.length; y++) {
            for (let x = 0; x < matrix[y].length; x++) {
                if (!matrix[y][x]) continue;
                this.paintBlock(
                    ctx,
                    offsetX + x * PREVIEW_CELL,
                    offsetY + y * PREVIEW_CELL,
                    PREVIEW_CELL,
                    COLORS[type],
                    1
                );
            }
        }
    }

    private drawNext() {
        const ctx = this.nextCtx;
        ctx.fillStyle = INK;
        ctx.fillRect(0, 0, NEXT_W, NEXT_H);

        ctx.strokeStyle = 'rgba(244, 239, 228, 0.12)';
        ctx.lineWidth = 1;
        for (let i = 1; i < NEXT_VISIBLE; i++) {
            const y = i * NEXT_SLOT + 0.5;
            ctx.beginPath();
            ctx.moveTo(10, y);
            ctx.lineTo(NEXT_W - 10, y);
            ctx.stroke();
        }

        const preview = this.previewQueue();
        preview.forEach((type, index) => {
            this.drawPreview(ctx, type, NEXT_W / 2, index * NEXT_SLOT + NEXT_SLOT / 2);
        });
    }

    private drawHold() {
        const ctx = this.holdCtx;
        ctx.fillStyle = INK;
        ctx.fillRect(0, 0, HOLD_W, HOLD_H);
        this.drawPreview(ctx, this.held, HOLD_W / 2, HOLD_H / 2);
    }

    // ------------------------------------------------------------------- chrome

    private format(value: number): string {
        return value.toLocaleString('en-US');
    }

    private loadBest() {
        const saved = localStorage.getItem(BEST_KEY);
        this.best = saved ? Number.parseInt(saved, 10) || 0 : 0;
        this.bestEl.textContent = this.format(this.best);
    }

    private updateStats() {
        this.scoreEl.textContent = this.format(this.score);
        this.bestEl.textContent = this.format(this.best);
        this.linesEl.textContent = String(this.lines);
        this.levelEl.textContent = String(this.level).padStart(2, '0');
    }

    private announce(message: string) {
        this.statusEl.textContent = message;
    }
}

new TetrisGame();
