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

  describe('normal mode (CHINWAG_DEBUG not set)', () => {
    it('logs info with [chinwag] prefix', () => {
      const log = createLogger('test');
      log.info('hello');
      expect(errorSpy).toHaveBeenCalledWith('[chinwag] hello');
    });

    it('logs warn with [chinwag] prefix', () => {
      const log = createLogger('test');
      log.warn('careful');
      expect(errorSpy).toHaveBeenCalledWith('[chinwag] careful');
    });

    it('logs error with [chinwag] prefix', () => {
      const log = createLogger('test');
      log.error('broken');
      expect(errorSpy).toHaveBeenCalledWith('[chinwag] broken');
    });

    it('suppresses debug messages', () => {
      const log = createLogger('test');
      log.debug('hidden');
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('ignores context in normal mode', () => {
      const log = createLogger('test');
      log.info('msg', { key: 'val' });
      expect(errorSpy).toHaveBeenCalledWith('[chinwag] msg');
    });

    it('ignores source name in normal mode output', () => {
      const log = createLogger('mySpecialModule');
      log.info('test');
      expect(errorSpy).toHaveBeenCalledWith('[chinwag] test');
    });
  });

  describe('debug mode (CHINWAG_DEBUG=1)', () => {
    beforeEach(() => {
      process.env.CHINWAG_DEBUG = '1';
    });

    it('includes source tag in output', () => {
      const log = createLogger('myModule');
      log.info('event');
      expect(errorSpy).toHaveBeenCalledWith('[chinwag:myModule] event');
    });

    it('includes WARN level tag', () => {
      const log = createLogger('myModule');
      log.warn('something');
      expect(errorSpy).toHaveBeenCalledWith('[chinwag:myModule] WARN something');
    });

    it('includes ERROR level tag', () => {
      const log = createLogger('myModule');
      log.error('fail');
      expect(errorSpy).toHaveBeenCalledWith('[chinwag:myModule] ERROR fail');
    });

    it('includes DEBUG level tag', () => {
      const log = createLogger('myModule');
      log.debug('trace');
      expect(errorSpy).toHaveBeenCalledWith('[chinwag:myModule] DEBUG trace');
    });

    it('omits level tag for info (info is the default)', () => {
      const log = createLogger('src');
      log.info('started');
      expect(errorSpy).toHaveBeenCalledWith('[chinwag:src] started');
    });

    it('includes context as JSON', () => {
      const log = createLogger('myModule');
      log.info('event', { key: 'val' });
      expect(errorSpy).toHaveBeenCalledWith('[chinwag:myModule] event {"key":"val"}');
    });

    it('includes context with multiple keys', () => {
      const log = createLogger('src');
      log.warn('issue', { code: 42, msg: 'bad' });
      expect(errorSpy).toHaveBeenCalledWith('[chinwag:src] WARN issue {"code":42,"msg":"bad"}');
    });

    it('omits context when it is an empty object', () => {
      const log = createLogger('src');
      log.info('clean', {});
      expect(errorSpy).toHaveBeenCalledWith('[chinwag:src] clean');
    });

    it('omits context when undefined', () => {
      const log = createLogger('src');
      log.info('no ctx');
      expect(errorSpy).toHaveBeenCalledWith('[chinwag:src] no ctx');
    });

    it('shows debug messages', () => {
      const log = createLogger('myModule');
      log.debug('trace');
      expect(errorSpy).toHaveBeenCalled();
    });
  });

  describe('all levels use console.error (never console.log)', () => {
    it('uses console.error for info, warn, error', () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const log = createLogger('test');
      log.info('msg');
      log.warn('msg');
      log.error('msg');
      expect(logSpy).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalledTimes(3);
      logSpy.mockRestore();
    });

    it('uses console.error for debug when in debug mode', () => {
      process.env.CHINWAG_DEBUG = '1';
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const log = createLogger('test');
      log.debug('msg');
      expect(logSpy).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalledTimes(1);
      logSpy.mockRestore();
    });
  });
});
