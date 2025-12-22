/**
 * 轻量级信号类 - 用于系统间解耦通信
 * 
 * 使用示例:
 * ```typescript
 * const onJump = new Signal<{ isDoubleJump: boolean }>();
 * 
 * // 订阅
 * const unsubscribe = onJump.connect((data) => console.log(data));
 * 
 * // 发射
 * onJump.emit({ isDoubleJump: true });
 * 
 * // 取消订阅
 * unsubscribe();
 * ```
 */
export class Signal<T = void> {
    private listeners: Set<(data: T) => void> = new Set();

    /**
     * 连接监听器
     * @returns 取消订阅函数
     */
    connect(fn: (data: T) => void): () => void {
        this.listeners.add(fn);
        return () => this.listeners.delete(fn);
    }

    /**
     * 发射信号
     */
    emit(data: T): void {
        this.listeners.forEach(fn => fn(data));
    }

    /**
     * 清除所有监听器
     */
    clear(): void {
        this.listeners.clear();
    }

    /**
     * 获取监听器数量（用于调试）
     */
    get listenerCount(): number {
        return this.listeners.size;
    }
}
