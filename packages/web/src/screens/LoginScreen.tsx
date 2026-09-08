import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { useTheme, Button, Input, Card, Icon, Spinner } from '@acode/ui';

export function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const { login, isLoading: authLoading } = useAuth();
  const { tokens } = useTheme();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [shake, setShake] = useState(false);

  const handleLogin = useCallback(async () => {
    if (!pin || pin.length < 4) {
      setError('PIN must be at least 4 digits');
      setShake(true);
      setTimeout(() => setShake(false), 300);
      return;
    }

    setIsLoading(true);
    setError('');

    const success = await login(pin);
    if (success) {
      onLogin();
    } else {
      setError('Incorrect PIN');
      setShake(true);
      setTimeout(() => setShake(false), 300);
    }
    setIsLoading(false);
  }, [pin, login, onLogin]);

  useEffect(() => {
    if (error) {
      setShake(true);
      setTimeout(() => setShake(false), 300);
    }
  }, [error]);

  if (authLoading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: tokens.bg,
      }}>
        <Spinner size={32} />
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: tokens.bg,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
    }}>
      <Card style={{
        width: '100%',
        maxWidth: '360px',
        padding: '32px',
        boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
        transform: shake ? 'translateX(-10px)' : 'none',
        transition: 'transform 0.1s ease-in-out',
      }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{
            width: '80px',
            height: '80px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, var(--primary) 0%, #8b5cf6 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 24px',
            boxShadow: '0 8px 24px rgba(124, 108, 255, 0.4)',
          }}>
            <Icon name="lock" size={36} color="#fff" />
          </div>
          <h1 style={{
            margin: '0 0 8px',
            fontSize: '28px',
            fontWeight: '700',
            color: tokens.text,
            letterSpacing: '-0.02em',
          }}>
            Welcome back
          </h1>
          <p style={{
            margin: '0',
            color: tokens.textSecondary,
            fontSize: '16px',
          }}>
            Enter your PIN to access AcodeDev
          </p>
        </div>

        <Input
          label="PIN"
          type="password"
          value={pin}
          onChange={setPin}
          placeholder="Enter your PIN"
          onEnter={handleLogin}
          disabled={isLoading}
        />

        {error && (
          <div style={{
            color: tokens.danger,
            fontSize: '14px',
            marginBottom: '16px',
            textAlign: 'center',
            padding: '12px',
            background: `${tokens.danger}15`,
            borderRadius: '8px',
            border: `1px solid ${tokens.danger}30`,
          }}>
            <Icon name="circleAlert" size={16} />
            <span style={{ marginLeft: '6px' }}>{error}</span>
          </div>
        )}

        <Button
          onClick={handleLogin}
          disabled={isLoading || !pin}
          full
          style={{
            padding: '16px',
            fontSize: '16px',
            fontWeight: '600',
          }}
        >
          {isLoading ? (
            <>
              <Spinner size={18} color="#fff" />
              <span style={{ marginLeft: '8px' }}>Unlocking...</span>
            </>
          ) : (
            'Unlock'
          )}
        </Button>

        <div style={{
          marginTop: '24px',
          padding: '16px',
          background: `${tokens.primary}10`,
          borderRadius: '12px',
          border: `1px solid ${tokens.primary}20`,
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '8px',
            fontWeight: '600',
            color: tokens.primary,
          }}>
            <Icon name="circleAlert" size={18} />
            <span>First time here?</span>
          </div>
          <p style={{
            margin: '0',
            fontSize: '13px',
            color: tokens.textSecondary,
            lineHeight: 1.5,
          }}>
            You'll be prompted to create a PIN on your first visit. This PIN encrypts your API keys and settings locally.
          </p>
        </div>
      </Card>
    </div>
  );
}

export function SetupPinScreen({ onComplete }: { onComplete: () => void }) {
  const { setupPin } = useAuth();
  const { tokens } = useTheme();
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<'create' | 'confirm'>('create');

  const handleNext = useCallback(async () => {
    if (step === 'create') {
      if (!pin || pin.length < 4) {
        setError('PIN must be at least 4 digits');
        return;
      }
      setStep('confirm');
      setError('');
    } else {
      if (pin !== confirmPin) {
        setError('PINs do not match');
        return;
      }
      setIsLoading(true);
      try {
        await setupPin(pin);
        onComplete();
      } catch {
        setError('Failed to save PIN');
      }
      setIsLoading(false);
    }
  }, [pin, confirmPin, step, setupPin, onComplete]);

  const currentPin = step === 'create' ? pin : confirmPin;
  const placeholder = step === 'create' ? 'Create a PIN (min 4 digits)' : 'Confirm your PIN';

  return (
    <div style={{
      minHeight: '100vh',
      background: tokens.bg,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
    }}>
      <Card style={{
        width: '100%',
        maxWidth: '360px',
        padding: '32px',
        boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{
            width: '80px',
            height: '80px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, var(--primary) 0%, #8b5cf6 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 24px',
            boxShadow: '0 8px 24px rgba(124, 108, 255, 0.4)',
          }}>
            <Icon name={step === 'create' ? 'lock' : 'checkCircle'} size={36} color="#fff" />
          </div>
          <h1 style={{
            margin: '0 0 8px',
            fontSize: '28px',
            fontWeight: '700',
            color: tokens.text,
          }}>
            {step === 'create' ? 'Create PIN' : 'Confirm PIN'}
          </h1>
          <p style={{ margin: '0', color: tokens.textSecondary }}>
            {step === 'create'
              ? 'Create a secure PIN to protect your data'
              : 'Re-enter your PIN to confirm'}
          </p>
        </div>

        <Input
          label={step === 'create' ? 'New PIN' : 'Confirm PIN'}
          type="password"
          value={currentPin}
          onChange={step === 'create' ? setPin : setConfirmPin}
          placeholder={placeholder}
          onEnter={handleNext}
          disabled={isLoading}
        />

        {error && (
          <div style={{
            color: tokens.danger,
            fontSize: '14px',
            marginBottom: '16px',
            textAlign: 'center',
            padding: '12px',
            background: `${tokens.danger}15`,
            borderRadius: '8px',
            border: `1px solid ${tokens.danger}30`,
          }}>
            {error}
          </div>
        )}

        <Button
          onClick={handleNext}
          disabled={isLoading || !currentPin || (step === 'confirm' && pin !== confirmPin)}
          full
          style={{ padding: '16px', fontSize: '16px', fontWeight: '600' }}
        >
          {isLoading ? (
            <>
              <Spinner size={18} color="#fff" />
              <span style={{ marginLeft: '8px' }}>Setting up...</span>
            </>
          ) : step === 'create' ? (
            'Continue'
          ) : (
            'Create PIN'
          )}
        </Button>

        <div style={{
          marginTop: '24px',
          padding: '16px',
          background: `${tokens.primary}10`,
          borderRadius: '12px',
          border: `1px solid ${tokens.primary}20`,
          textAlign: 'center',
        }}>
          <Icon name="shield" size={20} style={{ color: tokens.primary, marginBottom: '8px', display: 'block' }} />
          <p style={{ margin: '0', fontSize: '13px', color: tokens.textSecondary, lineHeight: 1.5 }}>
            Your PIN is used to encrypt your API keys and settings locally. 
            It never leaves your device. You can enable biometric unlock after setup.
          </p>
        </div>
      </Card>
    </div>
  );
}
