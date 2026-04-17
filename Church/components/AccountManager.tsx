import React, { useEffect, useState } from 'react';
import { useAdmin } from '../hooks/useAdmin';
import { adminRoleLabel } from '../utils/adminRoles';

type AccountManagerProps = {
  initialMode?: 'profile' | 'password';
};

const AccountManager: React.FC<AccountManagerProps> = ({ initialMode = 'profile' }) => {
  const { currentUser, updateCurrentUserProfile } = useAdmin();
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
      setError('Current password is required to change your email.');
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
      setMessage('Profile updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update profile.');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const savePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setMessage('');

    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.');
      return;
    }

    setIsSavingPassword(true);
    try {
      await updateCurrentUserProfile({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setMessage('Password updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update password.');
    } finally {
      setIsSavingPassword(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-lg bg-white p-6 shadow-sm">
        <h2 className="text-2xl font-bold text-gray-900">My Account</h2>
        <p className="mt-1 text-sm text-gray-600">Keep your Admin sign-in details current.</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-md bg-gray-100 px-3 py-1 text-sm font-semibold text-gray-700">
            {adminRoleLabel(currentUser.role)}
          </div>
          <button
            type="button"
            onClick={() => setMode('profile')}
            className={`rounded-md px-3 py-2 text-sm font-semibold ${mode === 'profile' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700'}`}
          >
            Profile Setting
          </button>
          <button
            type="button"
            onClick={() => setMode('password')}
            className={`rounded-md px-3 py-2 text-sm font-semibold ${mode === 'password' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700'}`}
          >
            Change Password
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
          <h3 className="text-lg font-bold text-gray-900">Profile</h3>
          <div className="mt-4 space-y-4">
            <label className="block space-y-2">
              <span className="text-sm font-semibold text-gray-700">Name</span>
              <input
                value={name}
                onChange={event => setName(event.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                required
              />
            </label>
            <label className="block space-y-2">
              <span className="text-sm font-semibold text-gray-700">Email</span>
              <input
                type="email"
                value={email}
                onChange={event => setEmail(event.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                required
              />
            </label>
            <label className="block space-y-2">
              <span className="text-sm font-semibold text-gray-700">Current password</span>
              <input
                type="password"
                value={currentPassword}
                onChange={event => setCurrentPassword(event.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                placeholder="Required when changing email"
                autoComplete="current-password"
              />
            </label>
          </div>
          <button
            type="submit"
            disabled={isSavingProfile}
            className="mt-5 rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:bg-gray-400"
          >
            {isSavingProfile ? 'Saving...' : 'Save Profile'}
          </button>
        </form>
      ) : (
        <form onSubmit={savePassword} className="rounded-lg bg-white p-6 shadow-sm">
          <h3 className="text-lg font-bold text-gray-900">Password</h3>
          <div className="mt-4 space-y-4">
            <label className="block space-y-2">
              <span className="text-sm font-semibold text-gray-700">Current password</span>
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
              <span className="text-sm font-semibold text-gray-700">New password</span>
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
              <span className="text-sm font-semibold text-gray-700">Confirm new password</span>
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
            {isSavingPassword ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      )}
    </div>
  );
};

export default AccountManager;
