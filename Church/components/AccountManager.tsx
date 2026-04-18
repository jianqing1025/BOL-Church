import React, { useEffect, useState } from 'react';
import { useAdmin } from '../hooks/useAdmin';
import { useLocalization } from '../hooks/useLocalization';

type AccountManagerProps = {
  initialMode?: 'profile' | 'password';
};

const AccountManager: React.FC<AccountManagerProps> = ({ initialMode = 'profile' }) => {
  const { currentUser, updateCurrentUserProfile } = useAdmin();
  const { t } = useLocalization();
  const [name, setName] = useState(currentUser?.name ?? '');
  const [email, setEmail] = useState(currentUser?.email ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [mode, setMode] = useState<'profile' | 'password'>(initialMode);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  useEffect(() => {
    setName(currentUser?.name ?? '');
    setEmail(currentUser?.email ?? '');
  }, [currentUser]);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  if (!currentUser) {
    return null;
  }

  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setMessage('');

    const emailChanged = email.trim().toLowerCase() !== currentUser.email;
    if (emailChanged && !currentPassword) {
      setError(t('admin.currentPasswordEmailRequired'));
      return;
    }

    setIsSavingProfile(true);
    try {
      await updateCurrentUserProfile({
        name,
        email,
        currentPassword: emailChanged ? currentPassword : undefined,
      });
      setCurrentPassword('');
      setMessage(t('admin.profileUpdated'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('admin.profileUpdateFailed'));
    } finally {
      setIsSavingProfile(false);
    }
  };

  const savePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setMessage('');

    if (newPassword.length < 8) {
      setError(t('admin.newPasswordTooShort'));
      return;
    }

    if (newPassword !== confirmPassword) {
      setError(t('admin.passwordMismatch'));
      return;
    }

    setIsSavingPassword(true);
    try {
      await updateCurrentUserProfile({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setMessage(t('admin.passwordUpdated'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('admin.passwordUpdateFailed'));
    } finally {
      setIsSavingPassword(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-lg bg-white p-6 shadow-sm">
        <h2 className="text-2xl font-bold text-gray-900">{t('admin.myAccount')}</h2>
        <p className="mt-1 text-sm text-gray-600">{t('admin.accountSubtitle')}</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-md bg-gray-100 px-3 py-1 text-sm font-semibold text-gray-700">
            {currentUser.role === 'owner' ? t('admin.owner') : t('admin.adminRole')}
          </div>
          <button
            type="button"
            onClick={() => setMode('profile')}
            className={`rounded-md px-3 py-2 text-sm font-semibold ${mode === 'profile' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700'}`}
          >
            {t('admin.profileSetting')}
          </button>
          <button
            type="button"
            onClick={() => setMode('password')}
            className={`rounded-md px-3 py-2 text-sm font-semibold ${mode === 'password' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700'}`}
          >
            {t('admin.changePassword')}
          </button>
        </div>
        {message && (
          <div className="mt-4 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            {message}
          </div>
        )}
        {error && (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
      </div>

      {mode === 'profile' ? (
        <form onSubmit={saveProfile} className="rounded-lg bg-white p-6 shadow-sm">
          <h3 className="text-lg font-bold text-gray-900">{t('admin.profile')}</h3>
          <div className="mt-4 space-y-4">
            <label className="block space-y-2">
              <span className="text-sm font-semibold text-gray-700">{t('admin.name')}</span>
              <input
                value={name}
                onChange={event => setName(event.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                required
              />
            </label>
            <label className="block space-y-2">
              <span className="text-sm font-semibold text-gray-700">{t('admin.email')}</span>
              <input
                type="email"
                value={email}
                onChange={event => setEmail(event.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                required
              />
            </label>
            <label className="block space-y-2">
              <span className="text-sm font-semibold text-gray-700">{t('admin.currentPassword')}</span>
              <input
                type="password"
                value={currentPassword}
                onChange={event => setCurrentPassword(event.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                placeholder={t('admin.requiredWhenChangingEmail')}
                autoComplete="current-password"
              />
            </label>
          </div>
          <button
            type="submit"
            disabled={isSavingProfile}
            className="mt-5 rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:bg-gray-400"
          >
            {isSavingProfile ? t('admin.saving') : t('admin.saveProfile')}
          </button>
        </form>
      ) : (
        <form onSubmit={savePassword} className="rounded-lg bg-white p-6 shadow-sm">
          <h3 className="text-lg font-bold text-gray-900">{t('admin.password')}</h3>
          <div className="mt-4 space-y-4">
            <label className="block space-y-2">
              <span className="text-sm font-semibold text-gray-700">{t('admin.currentPassword')}</span>
              <input
                type="password"
                value={currentPassword}
                onChange={event => setCurrentPassword(event.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                autoComplete="current-password"
                required
              />
            </label>
            <label className="block space-y-2">
              <span className="text-sm font-semibold text-gray-700">{t('admin.newPassword')}</span>
              <input
                type="password"
                value={newPassword}
                onChange={event => setNewPassword(event.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                autoComplete="new-password"
                required
              />
            </label>
            <label className="block space-y-2">
              <span className="text-sm font-semibold text-gray-700">{t('admin.confirmNewPassword')}</span>
              <input
                type="password"
                value={confirmPassword}
                onChange={event => setConfirmPassword(event.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                autoComplete="new-password"
                required
              />
            </label>
          </div>
          <button
            type="submit"
            disabled={isSavingPassword}
            className="mt-5 rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:bg-gray-400"
          >
            {isSavingPassword ? t('admin.updating') : t('admin.updatePassword')}
          </button>
        </form>
      )}
    </div>
  );
};

export default AccountManager;
