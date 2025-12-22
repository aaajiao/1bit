import { describe, expect, it, vi } from 'vitest';
import { Signal } from '../src/core/Signal';

describe('Signal', () => {
    it('should emit to connected listeners', () => {
        const signal = new Signal<number>();
        const listener = vi.fn();

        signal.connect(listener);
        signal.emit(42);

        expect(listener).toHaveBeenCalledWith(42);
        expect(listener).toHaveBeenCalledTimes(1);
    });

    it('should support multiple listeners', () => {
        const signal = new Signal<string>();
        const listener1 = vi.fn();
        const listener2 = vi.fn();

        signal.connect(listener1);
        signal.connect(listener2);
        signal.emit('test');

        expect(listener1).toHaveBeenCalledWith('test');
        expect(listener2).toHaveBeenCalledWith('test');
    });

    it('should disconnect individual listeners', () => {
        const signal = new Signal<number>();
        const listener = vi.fn();

        const disconnect = signal.connect(listener);
        disconnect();
        signal.emit(100);

        expect(listener).not.toHaveBeenCalled();
    });

    it('should clear all listeners', () => {
        const signal = new Signal<void>();
        const listener1 = vi.fn();
        const listener2 = vi.fn();

        signal.connect(listener1);
        signal.connect(listener2);
        signal.clear();
        signal.emit();

        expect(listener1).not.toHaveBeenCalled();
        expect(listener2).not.toHaveBeenCalled();
    });

    it('should report listener count', () => {
        const signal = new Signal<void>();

        expect(signal.listenerCount).toBe(0);

        const d1 = signal.connect(() => {});
        expect(signal.listenerCount).toBe(1);

        signal.connect(() => {});
        expect(signal.listenerCount).toBe(2);

        d1();
        expect(signal.listenerCount).toBe(1);
    });

    it('should work with void type', () => {
        const signal = new Signal<void>();
        const listener = vi.fn();

        signal.connect(listener);
        signal.emit();

        expect(listener).toHaveBeenCalled();
    });
});
