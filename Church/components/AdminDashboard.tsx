
import React, { useState } from 'react';
import { useAdmin } from '../hooks/useAdmin';
import { useLocalization } from '../hooks/useLocalization';
import AdminLogin from './AdminLogin';

type Tab = 'dashboard' | 'messages' | 'prayer' | 'giving';

const AdminDashboard: React.FC = () => {
    const { 
        isAdminMode, logout, 
        messages, deleteMessage, markMessageRead,
        prayerRequests, deletePrayerRequest, markPrayerPrayed,
        donations 
    } = useAdmin();
    const { t } = useLocalization();
    const [activeTab, setActiveTab] = useState<Tab>('messages');

    if (!isAdminMode) {
        // Reuse the AdminLogin modal but displayed as a full page centered component
        // Redirect to home if closed
        return (
             <div className="min-h-screen bg-gray-100 flex items-center justify-center">
                 <AdminLogin onClose={() => window.location.hash = '#/'} /> 
             </div>
        );
    }

    const formatDate = (isoString: string) => {
        return new Date(isoString).toLocaleDateString('en-US', {
            year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });
    };

    const renderMessages = () => (
        <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-bold text-gray-800">{t('admin.inbox')} ({messages.length})</h3>
            </div>
            {messages.length === 0 ? (
                <div className="p-6 text-center text-gray-500">{t('admin.noMessages')}</div>
            ) : (
                <div className="divide-y divide-gray-200">
                    {messages.map(msg => (
                        <div key={msg.id} className={`p-6 hover:bg-gray-50 transition-colors ${!msg.read ? 'bg-blue-50' : ''}`}>
                            <div className="flex justify-between items-start mb-2">
                                <div>
                                    <h4 className="text-md font-bold text-gray-900">{msg.firstName} {msg.lastName}</h4>
                                    <div className="text-sm text-gray-500">{msg.email} &bull; {msg.phone}</div>
                                </div>
                                <div className="text-xs text-gray-400">{formatDate(msg.date)}</div>
                            </div>
                            <p className="text-gray-700 mt-2 whitespace-pre-wrap">{msg.message}</p>
                            <div className="mt-4 flex gap-3">
                                {!msg.read && (
                                    <button onClick={() => markMessageRead(msg.id)} className="text-xs bg-blue-100 text-blue-700 px-3 py-1 rounded-full font-semibold hover:bg-blue-200">
                                        {t('admin.markRead')}
                                    </button>
                                )}
                                <button onClick={() => deleteMessage(msg.id)} className="text-xs bg-red-100 text-red-700 px-3 py-1 rounded-full font-semibold hover:bg-red-200">
                                    {t('admin.delete')}
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );

    const renderPrayerRequests = () => (
        <div className="bg-white rounded-lg shadow overflow-hidden">
             <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-bold text-gray-800">{t('admin.prayerWall')} ({prayerRequests.length})</h3>
            </div>
             {prayerRequests.length === 0 ? (
                <div className="p-6 text-center text-gray-500">{t('admin.noPrayers')}</div>
            ) : (
                <div className="divide-y divide-gray-200">
                    {prayerRequests.map(req => (
                        <div key={req.id} className={`p-6 hover:bg-gray-50 transition-colors ${req.status === 'new' ? 'bg-yellow-50' : ''}`}>
                             <div className="flex justify-between items-start mb-2">
                                <div>
                                    <h4 className="text-md font-bold text-gray-900">
                                        {req.firstName || 'Anonymous'} {req.lastName}
                                    </h4>
                                    <div className="text-sm text-gray-500">
                                        {req.email && <span>{req.email} &bull; </span>}
                                        {req.phone && <span>{req.phone}</span>}
                                    </div>
                                </div>
                                <div className="text-xs text-gray-400">{formatDate(req.date)}</div>
                            </div>
                            <p className="text-gray-700 mt-2 whitespace-pre-wrap italic">"{req.message}"</p>
                             <div className="mt-4 flex gap-3">
                                {req.status === 'new' ? (
                                    <button onClick={() => markPrayerPrayed(req.id)} className="text-xs bg-green-100 text-green-700 px-3 py-1 rounded-full font-semibold hover:bg-green-200">
                                        {t('admin.markPrayed')}
                                    </button>
                                ) : (
                                    <span className="text-xs bg-gray-100 text-gray-600 px-3 py-1 rounded-full font-semibold">{t('admin.prayed')}</span>
                                )}
                                <button onClick={() => deletePrayerRequest(req.id)} className="text-xs bg-red-100 text-red-700 px-3 py-1 rounded-full font-semibold hover:bg-red-200">
                                    {t('admin.delete')}
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );

    const renderGiving = () => {
        const totalGiven = donations.reduce((sum, d) => sum + d.amount, 0);

        return (
            <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-white p-6 rounded-lg shadow">
                        <h4 className="text-sm font-semibold text-gray-500 uppercase">{t('admin.totalDonations')}</h4>
                        <div className="text-3xl font-bold text-gray-900 mt-2">${totalGiven.toLocaleString()}</div>
                    </div>
                     <div className="bg-white p-6 rounded-lg shadow">
                        <h4 className="text-sm font-semibold text-gray-500 uppercase">{t('admin.totalTransactions')}</h4>
                        <div className="text-3xl font-bold text-gray-900 mt-2">{donations.length}</div>
                    </div>
                </div>

                <div className="bg-white rounded-lg shadow overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-200">
                        <h3 className="text-lg font-bold text-gray-800">{t('admin.recentTransactions')}</h3>
                    </div>
                    {donations.length === 0 ? (
                        <div className="p-6 text-center text-gray-500">{t('admin.noDonations')}</div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">{t('admin.tableDate')}</th>
                                        <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">{t('admin.tableAmount')}</th>
                                        <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">{t('admin.tableType')}</th>
                                        <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">{t('admin.tableStatus')}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                    {donations.map(donation => (
                                        <tr key={donation.id} className="hover:bg-gray-50">
                                            <td className="px-6 py-4 text-sm text-gray-600">{formatDate(donation.date)}</td>
                                            <td className="px-6 py-4 text-sm font-bold text-gray-900">${donation.amount}</td>
                                            <td className="px-6 py-4 text-sm text-gray-600 capitalize">{donation.type}</td>
                                            <td className="px-6 py-4 text-sm">
                                                <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full font-semibold">
                                                    {donation.status}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="min-h-screen bg-gray-100 flex">
            {/* Sidebar */}
            <aside className="w-64 bg-gray-900 text-white flex-shrink-0 hidden md:block">
                <div className="p-6 text-center border-b border-gray-800">
                    <h2 className="text-xl font-bold">{t('admin.adminPanelTitle')}</h2>
                    <p className="text-xs text-gray-400 mt-1">{t('admin.churchName')}</p>
                </div>
                <nav className="p-4 space-y-2">
                    <button 
                        onClick={() => setActiveTab('messages')} 
                        className={`w-full text-left px-4 py-3 rounded transition-colors ${activeTab === 'messages' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}
                    >
                        {t('admin.messagesTab')}
                        {messages.filter(m => !m.read).length > 0 && (
                            <span className="ml-2 bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">{messages.filter(m => !m.read).length}</span>
                        )}
                    </button>
                    <button 
                        onClick={() => setActiveTab('prayer')} 
                        className={`w-full text-left px-4 py-3 rounded transition-colors ${activeTab === 'prayer' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}
                    >
                        {t('admin.prayerTab')}
                        {prayerRequests.filter(r => r.status === 'new').length > 0 && (
                            <span className="ml-2 bg-yellow-500 text-white text-xs px-2 py-0.5 rounded-full">{prayerRequests.filter(r => r.status === 'new').length}</span>
                        )}
                    </button>
                    <button 
                        onClick={() => setActiveTab('giving')} 
                        className={`w-full text-left px-4 py-3 rounded transition-colors ${activeTab === 'giving' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}
                    >
                        {t('admin.givingTab')}
                    </button>
                    <div className="pt-8 mt-8 border-t border-gray-800">
                        <button 
                            onClick={logout} 
                            className="w-full text-left px-4 py-2 text-gray-400 hover:text-white hover:bg-red-900 rounded transition-colors"
                        >
                            {t('admin.signOut')}
                        </button>
                        <a href="#/" className="block w-full text-left px-4 py-2 mt-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded transition-colors">
                            &larr; {t('admin.backToWebsite')}
                        </a>
                    </div>
                </nav>
            </aside>

            {/* Main Content */}
            <main className="flex-grow p-8 overflow-y-auto h-screen">
                <div className="md:hidden mb-6 flex justify-between items-center">
                    <h1 className="text-2xl font-bold text-gray-800">{t('admin.dashboardTitle')}</h1>
                     <a href="#/" className="text-blue-600 text-sm">{t('admin.exit')}</a>
                </div>

                {/* Mobile Tabs */}
                <div className="md:hidden flex space-x-2 mb-6 overflow-x-auto pb-2">
                     <button onClick={() => setActiveTab('messages')} className={`px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap ${activeTab === 'messages' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600'}`}>{t('admin.messagesTab')}</button>
                     <button onClick={() => setActiveTab('prayer')} className={`px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap ${activeTab === 'prayer' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600'}`}>{t('admin.prayerTab')}</button>
                     <button onClick={() => setActiveTab('giving')} className={`px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap ${activeTab === 'giving' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600'}`}>{t('admin.givingTab')}</button>
                </div>

                <div className="max-w-5xl mx-auto">
                    {activeTab === 'messages' && renderMessages()}
                    {activeTab === 'prayer' && renderPrayerRequests()}
                    {activeTab === 'giving' && renderGiving()}
                </div>
            </main>
        </div>
    );
};

export default AdminDashboard;
