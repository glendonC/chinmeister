import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLogger } from '../logger.js';

describe('createLogger', () => {
  let errorSpy;
  const originalEnv = process.env.CHINWAG_DEBUG;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    delete process.env.CHINWAG_DEBUG;
  });

  afterEach(() => {
    errorSpy.mockRestore();
    if (originalEnv !== undefined) {
      process.env.CHINWAG_DEBUG = originalEnv;
    } else {
      delete process.env.CHINWAG_DEBUG;
    }
  });

  it('logs info with [chinwag] prefix in normal mode', () => {
    const log = createLogger('test');
    log.info('hello');
    expect(errorSpy).toHaveBeenCalledWith('[chinwag] hello');
  });

  it('logs warn with [chinwag] prefix in normal mode', () => {
    const log = createLogger('test');
    log.warn('careful');
    expect(errorSpy).toHaveBeenCalledWith('[chinwag] careful');
  });

  it('logs error with [chinwag] prefix in normal mode', () => {
    const log = createLogger('test');
    log.error('broken');
    expect(errorSpy).toHaveBeenCalledWith('[chinwag] broken');
  });

  it('suppresses debug in normal mode', () => {
    const log = createLogger('test');
    log.debug('hidden');
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('includes source and level in debug mode', () => {
    process.env.CHINWAG_DEBUG = '1';
    const log = createLogger('myModule');
    log.warn('something');
    expect(errorSpy).toHaveBeenCalledWith('[chinwag:myModule] WARN something');
  });

  it('includes context JSON in debug mode', () => {
    process.env.CHINWAG_DEBUG = '1';
    const log = createLogger('myModule');
    log.info('event', { key: 'val' });
    expect(errorSpy).toHaveBeenCalledWith('[chinwag:myModule] event {"key":"val"}');
  });

  it('shows debug messages in debug mode', () => {
    process.env.CHINWAG_DEBUG = '1';
    const log = createLogger('myModule');
    log.debug('trace');
    expect(errorSpy).toHaveBeenCalledWith('[chinwag:myModule] DEBUG trace');
  });

  it('omits level tag for info in debug mode', () => {
    process.env.CHINWAG_DEBUG = '1';
    const log = createLogger('src');
    log.info('started');
    expect(errorSpy).toHaveBeenCalledWith('[chinwag:src] started');
  });

  it('omits context when empty object', () => {
    process.env.CHINWAG_DEBUG = '1';
    const log = createLogger('src');
    log.info('clean', {});
    expect(errorSpy).toHaveBeenCalledWith('[chinwag:src] clean');
  });

  it('uses console.error for all levels', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const log = createLogger('test');
    log.info('msg');
    log.warn('msg');
    log.error('msg');
    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledTimes(3);
    logSpy.mockRestore();
  });
});
