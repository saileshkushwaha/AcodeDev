import React, { useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { useTheme, Button, Card, Input, Icon, Spinner } from '@acode/ui';
import { useApp } from '../state/AppProvider';

export function SettingsScreen() {
  const { session, changePin, enableBiometric, disableBiometric, logout, verifyPin } = useAuth();
  const { vault } = useApp();
  const { tokens } = useTheme();
  const [showChangePin, setShowChangePin] = useState(false);
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleChangePin = async () => {
    if (!oldPin || !newPin || !confirmPin) {
      setError('Please fill in all fields');
      return;
    }
    if (newPin.length < 4) {
      setError('PIN must be at least 4 digits');
      return;
    }
    if (newPin !== confirmPin) {
      setError('New PINs do not match');
      return;
    }
    if (!verifyPin(oldPin)) {
      setError('Current PIN is incorrect');
      return;
    }

    setIsLoading(true);
    setError('');
    setSuccess('');

    const success = await changePin(oldPin, newPin);
    if (success) {
      setSuccess('PIN changed successfully');
      setOldPin('');
      setNewPin('');
      setConfirmPin('');
      setShowChangePin(false);
    } else {
      setError('Failed to change PIN');
    }
    setIsLoading(false);
  };

  const handleEnableBiometric = async () => {
    setIsLoading(true);
    try {
      await enableBiometric();
      setSuccess('Biometric authentication enabled');
    } catch {
      setError('Failed to enable biometric');
    }
    setIsLoading(false);
  };

  const handleDisableBiometric = () => {
    disableBiometric();
    setSuccess('Biometric authentication disabled');
  };

  const handleLogout = () => {
    if (window.confirm('Are you sure you want to logout?')) {
      logout();
    }
  };

  const handleResetApp = async () => {
    if (window.confirm('This will delete ALL your data (API keys, settings, conversations). This cannot be undone. Are you sure?')) {
      if (window.confirm('Type "DELETE" to confirm')) {
        const input = prompt('Type "DELETE" to confirm');
        if (input === 'DELETE') {
          setIsLoading(true);
          try {
            await vault.clear();
            localStorage.clear();
            sessionStorage.clear();
            window.location.reload();
          } catch {
            setError('Failed to reset app');
          }
          setIsLoading(false);
        }
      }
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto' }}>
      <h1 style={{ margin: '0 0 24px', fontSize: '28px', fontWeight: '700' }}>Settings</h1>

      {/* Security Section */}
      <Card style={{ marginBottom: '24px' }}>
        <div style={{ padding: '16px 0', borderBottom: `1px solid ${tokens.border}` }}>
          <h2 style={{ margin: '0 0 8px', fontSize: '18px', fontWeight: '600' }}>Security</h2>
          <p style={{ margin: '0', fontSize: '13px', color: tokens.textSecondary }}>
            Manage your PIN and biometric authentication
          </p>
        </div>

        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                background: `${tokens.primary}15`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <Icon name="lock" size={18} color={tokens.primary} />
              </div>
              <div>
                <div style={{ fontWeight: '600', fontSize: '15px' }}>PIN Protection</div>
                <div style={{ fontSize: '13px', color: tokens.textSecondary }}>
                  {session.hasPin ? 'PIN is set' : 'Not set'}
                </div>
              </div>
            </div>
            <Button
              variant={session.hasPin ? 'secondary' : 'primary'}
              size="sm"
              onClick={() => setShowChangePin(true)}
            >
              {session.hasPin ? 'Change PIN' : 'Set PIN'}
            </Button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                background: `${tokens.success}15`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <Icon name="lock" size={18} color={tokens.success} />
              </div>
              <div>
                <div style={{ fontWeight: '600', fontSize: '15px' }}>Biometric Unlock</div>
                <div style={{ fontSize: '13px', color: tokens.textSecondary }}>
                  {session.biometricEnabled ? 'Enabled' : 'Disabled'}
                </div>
              </div>
            </div>
            <input
              type="checkbox"
              checked={session.biometricEnabled}
              onChange={session.biometricEnabled ? handleDisableBiometric : handleEnableBiometric}
              disabled={isLoading}
              style={{
                width: '44px',
                height: '24px',
                accentColor: tokens.primary,
              }}
            />
          </div>

          {showChangePin && (
            <Card style={{ background: `${tokens.primary}05`, border: `1px solid ${tokens.primary}20`, marginTop: '16px' }}>
              <div style={{ padding: '16px' }}>
                <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: '600' }}>
                  {session.hasPin ? 'Change PIN' : 'Set PIN'}
                </h3>
                <Input
                  label="Current PIN"
                  type="password"
                  value={oldPin}
                  onChange={setOldPin}
                  placeholder="Current PIN"
                />
                <Input
                  label="New PIN"
                  type="password"
                  value={newPin}
                  onChange={setNewPin}
                  placeholder="New PIN (min 4 digits)"
                />
                <Input
                  label="Confirm New PIN"
                  type="password"
                  value={confirmPin}
                  onChange={setConfirmPin}
                  placeholder="Confirm new PIN"
                />
                {error && <div style={{ color: tokens.danger, fontSize: '13px', marginTop: '8px' }}>{error}</div>}
                <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
                  <Button variant="ghost" size="sm" onClick={() => setShowChangePin(false)}>Cancel</Button>
                  <Button size="sm" onClick={handleChangePin} disabled={isLoading}>
                    {isLoading ? <><Spinner size={14} /> Saving...</> : 'Save'}
                  </Button>
                </div>
              </div>
            </Card>
          )}
        </div>
      </Card>

      {/* Session Section */}
      <Card style={{ marginBottom: '24px' }}>
        <div style={{ padding: '16px 0', borderBottom: `1px solid ${tokens.border}` }}>
          <h2 style={{ margin: '0 0 8px', fontSize: '18px', fontWeight: '600' }}>Session</h2>
          <p style={{ margin: '0', fontSize: '13px', color: tokens.textSecondary }}>
            Manage your active session
          </p>
        </div>

        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <Button variant="ghost" onClick={handleLogout} style={{ justifyContent: 'flex-start' }}>
            <Icon name="x" size={18} />
            <span>Logout</span>
          </Button>
        </div>
      </Card>

      {/* Danger Zone */}
      <Card style={{ border: `1px solid ${tokens.danger}30` }}>
        <div style={{ padding: '16px 0', borderBottom: `1px solid ${tokens.border}` }}>
          <h2 style={{ margin: '0 0 8px', fontSize: '18px', fontWeight: '600', color: tokens.danger }}>Danger Zone</h2>
          <p style={{ margin: '0', fontSize: '13px', color: tokens.textSecondary }}>
            Irreversible actions
          </p>
        </div>

        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <Button
            variant="danger"
            onClick={handleResetApp}
            disabled={isLoading}
            style={{ justifyContent: 'flex-start' }}
          >
            <Icon name="trash" size={18} />
            <span>Reset All Data</span>
          </Button>
        </div>
      </Card>

      {success && (
        <div style={{
          marginTop: '16px',
          padding: '12px 16px',
          background: `${tokens.success}15`,
          border: `1px solid ${tokens.success}30`,
          borderRadius: '8px',
          color: tokens.success,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}>
          <Icon name="checkCircle" size={18} />
          {success}
        </div>
      )}

      {error && (
        <div style={{
          marginTop: '16px',
          padding: '12px 16px',
          background: `${tokens.danger}15`,
          border: `1px solid ${tokens.danger}30`,
          borderRadius: '8px',
          color: tokens.danger,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}>
          <Icon name="circleAlert" size={18} />
          {error}
        </div>
      )}
    </div>
  );
}
