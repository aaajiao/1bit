/**
 * Lightweight signal class for decoupled inter-system communication
 *
 * Usage example:
 * ```typescript
 * const onJump = new Signal<{ isDoubleJump: boolean }>();
 *
 * // Subscribe
 * const unsubscribe = onJump.connect((data) => console.log(data));
 *
 * // Emit
 * onJump.emit({ isDoubleJump: true });
 *
 * // Unsubscribe
 * unsubscribe();
 * ```
 */
export class Signal<T = void> {
    private listeners: Set<(data: T) => void> = new Set();

    /**
     * Connect a listener
     * @returns Unsubscribe function
     */
    connect(fn: (data: T) => void): () => void {
        this.listeners.add(fn);
        return () => this.listeners.delete(fn);
    }

    /**
     * Emit signal
     */
    emit(data: T): void {
        this.listeners.forEach(fn => fn(data));
    }

    /**
     * Clear all listeners
     */
    clear(): void {
        this.listeners.clear();
    }

    /**
     * Get listener count (for debugging)
     */
    get listenerCount(): number {
        return this.listeners.size;
    }
}
