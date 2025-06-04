// Simple test to verify Jest is working
import { describe, it, expect } from '@jest/globals';

describe('Basic Test Suite', () => {
  it('should run a simple test', () => {
    expect(2 + 2).toBe(4);
  });

  it('should handle string operations', () => {
    expect('hello'.toUpperCase()).toBe('HELLO');
  });
});
