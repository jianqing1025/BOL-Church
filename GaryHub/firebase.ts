import { GuestMessage } from "./types";

export interface GuestbookService {
    fetchMessages(): Promise<GuestMessage[]>;
    sendMessage(msg: Omit<GuestMessage, 'id' | 'date' | 'approved'>): Promise<GuestMessage>;
    approveMessage(id: string): Promise<void>;
    deleteMessage(id: string): Promise<void>;
}

export const FirebaseService: GuestbookService = {
    async fetchMessages() {
        const resp = await fetch('/api/guestbook');
        const json = await resp.json();
        return (json.messages || []) as GuestMessage[];
    },
    async sendMessage(msg) {
        const resp = await fetch('/api/guestbook', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(msg)
        });
        return resp.json() as Promise<GuestMessage>;
    },
    async approveMessage(id: string) {
        await fetch(`/api/guestbook/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ approved: true })
        });
    },
    async deleteMessage(id: string) {
        await fetch(`/api/guestbook/${id}`, { method: 'DELETE' });
    }
};
