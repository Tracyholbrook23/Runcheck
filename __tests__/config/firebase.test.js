// Firebase Configuration Tests
// These tests verify the Firebase module structure and exports

describe('Firebase Configuration', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('exports auth object', () => {
    const { auth } = require('../../config/firebase');
    expect(auth).toBeDefined();
  });

  it('exports db object', () => {
    const { db } = require('../../config/firebase');
    expect(db).toBeDefined();
  });

  it('auth object has expected structure from mock', () => {
    const { auth } = require('../../config/firebase');
    expect(auth).toHaveProperty('currentUser');
  });

  it('can be imported multiple times without error', () => {
    expect(() => {
      require('../../config/firebase');
      require('../../config/firebase');
    }).not.toThrow();
  });

  it('Firebase mocks are properly configured', () => {
    const { initializeApp } = require('firebase/app');
    const { initializeAuth } = require('firebase/auth');
    const { getFirestore } = require('firebase/firestore');

    expect(typeof initializeApp).toBe('function');
    expect(typeof initializeAuth).toBe('function');
    expect(typeof getFirestore).toBe('function');
  });
});
