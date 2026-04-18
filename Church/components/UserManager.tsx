import React, { useState } from 'react';
import { useAdmin } from '../hooks/useAdmin';
import { useLocalization } from '../hooks/useLocalization';
import type { AdminRole, AdminUser } from '../data';

const emptyForm = {
  name: '',
  email: '',
  password: '',
  role: 'contributor' as AdminRole,
};

const UserManager: React.FC = () => {
  const { users, currentUser, createUser, updateUserRecord } = useAdmin();
  const { t } = useLocalization();
  const [form, setForm] = useState(emptyForm);
  const [passwords, setPasswords] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const activeOwnerCount = users.filter(user => user.active && user.role === 'owner').length;

  const submitCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setIsSaving(true);
    try {
      await createUser(form);
      setForm(emptyForm);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('admin.createUserFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  const updateUser = async (user: AdminUser, patch: Parameters<typeof updateUserRecord>[1]) => {
    setError('');
    try {
      await updateUserRecord(user.id, patch);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('admin.updateUserFailed'));
    }
  };

  const resetPassword = async (user: AdminUser) => {
    const password = passwords[user.id] || '';
    if (password.length < 8) {
      setError(t('admin.passwordTooShort'));
      return;
    }
    await updateUser(user, { password });
    setPasswords(current => ({ ...current, [user.id]: '' }));
  };

  return (
    <div className="space-y-6">
      <div className="rounded-lg bg-white p-6 shadow-sm">
        <h2 className="text-2xl font-bold text-gray-900">{t('admin.users')}</h2>
        <p className="mt-1 text-sm text-gray-600">{t('admin.usersSubtitle')}</p>
        {error && (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
      </div>

      <form onSubmit={submitCreate} className="rounded-lg bg-white p-6 shadow-sm">
        <h3 className="text-lg font-bold text-gray-900">{t('admin.createUser')}</h3>
        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1fr_1fr_180px]">
          <input
            value={form.name}
            onChange={event => setForm(current => ({ ...current, name: event.target.value }))}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
            placeholder={t('admin.name')}
            required
          />
          <input
            type="email"
            value={form.email}
            onChange={event => setForm(current => ({ ...current, email: event.target.value }))}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
            placeholder={t('admin.email')}
            required
          />
          <input
            type="password"
            value={form.password}
            onChange={event => setForm(current => ({ ...current, password: event.target.value }))}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
            placeholder={t('admin.password8Plus')}
            required
          />
          <select
            value={form.role}
            onChange={event => setForm(current => ({ ...current, role: event.target.value as AdminRole }))}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="contributor">{t('admin.adminRole')}</option>
            <option value="owner">{t('admin.owner')}</option>
          </select>
        </div>
        <button
          type="submit"
          disabled={isSaving}
          className="mt-4 rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:bg-gray-400"
        >
          {isSaving ? t('admin.creating') : t('admin.createUser')}
        </button>
      </form>

      <div className="overflow-hidden rounded-lg bg-white shadow-sm">
        <div className="border-b border-gray-200 px-6 py-4">
          <h3 className="text-lg font-bold text-gray-900">{t('admin.adminUsers')}</h3>
        </div>
        <div className="divide-y divide-gray-200">
          {users.map(user => {
            const isLastOwner = user.active && user.role === 'owner' && activeOwnerCount <= 1;
            return (
              <div key={user.id} className="grid gap-4 p-6 xl:grid-cols-[1fr_220px_280px_180px] xl:items-center">
                <div>
                  <div className="font-semibold text-gray-900">
                    {user.name} {currentUser?.id === user.id && <span className="text-xs text-blue-600">({t('admin.you')})</span>}
                  </div>
                  <div className="text-sm text-gray-500">{user.email}</div>
                  <div className="mt-1 text-xs text-gray-400">{t('admin.created')} {new Date(user.createdAt).toLocaleDateString()}</div>
                </div>
                <select
                  value={user.role}
                  disabled={isLastOwner}
                  onChange={event => void updateUser(user, { role: event.target.value as AdminRole })}
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100"
                >
                  <option value="owner">{t('admin.owner')}</option>
                  <option value="contributor">{t('admin.adminRole')}</option>
                </select>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={passwords[user.id] || ''}
                    onChange={event => setPasswords(current => ({ ...current, [user.id]: event.target.value }))}
                    className="min-w-0 flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
                    placeholder={t('admin.newPassword')}
                  />
                  <button
                    type="button"
                    onClick={() => void resetPassword(user)}
                    className="rounded-md bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-200"
                  >
                    {t('admin.reset')}
                  </button>
                </div>
                <button
                  type="button"
                  disabled={isLastOwner}
                  onClick={() => void updateUser(user, { active: !user.active })}
                  className={`rounded-md px-3 py-2 text-sm font-semibold disabled:bg-gray-100 disabled:text-gray-400 ${
                    user.active ? 'bg-red-50 text-red-700 hover:bg-red-100' : 'bg-green-50 text-green-700 hover:bg-green-100'
                  }`}
                >
                  {user.active ? t('admin.deactivate') : t('admin.activate')}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default UserManager;
