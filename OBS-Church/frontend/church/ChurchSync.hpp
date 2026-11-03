/******************************************************************************
    OBS Church — account and sync.

    Signed in, the church content (scenes and their slide items, the default
    style) and the files the items use are kept in the account on
    obs-sync.bolccop.org, so another computer signed in to the same account
    gets the same service. Sync runs on its own (at startup and after changes)
    and from the Sync button beside the Scenes list.

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 2 of the License, or
    (at your option) any later version.
******************************************************************************/

#pragma once

#include <QJsonObject>
#include <QObject>
#include <QPointer>
#include <QString>

#include <functional>
#include <map>
#include <tuple>

class ChurchMode;
class OBSBasic;
class QNetworkAccessManager;
class QNetworkReply;
class QTimer;
class QToolBar;
class QToolButton;

class ChurchSync : public QObject {
	Q_OBJECT

	ChurchMode *mode;
	OBSBasic *main;
	QNetworkAccessManager *net;
	QPointer<QToolButton> button;
	QPointer<QTimer> autoTimer;

	/* A few seconds after an edit here, the account gets it. */
	QPointer<QTimer> pushTimer;
	bool busy = false;
	/* The first sync after opening: the one moment a conflict may be asked about without being asked. */
	bool startupSync = true;
	/* Changes made here by hand since the last sync (kept across restarts). */
	bool Dirty() const;
	static bool HasItems(const QJsonObject &content);
	void SetDirty(bool dirty);
	/* File hashes already worked out: path → (modified time, size, sha256). */
	std::map<QString, std::tuple<qint64, qint64, QString>> hashCache;

	QString Server() const;
	QString Token() const;
	qint64 BaseRev() const;
	void SetBaseRev(qint64 rev);
	/* What this computer's content was when it was last in step with the account. */
	QString SyncedHash() const;
	void SetSyncedHash(const QString &hash);
	static QString ContentHash(const QJsonObject &content);
	bool LocalChanged() const;

	QNetworkReply *Request(const QByteArray &verb, const QString &path, const QByteArray &body = {},
			       const QByteArray &type = "application/json");
	void SetStatus(const QString &text, const QString &tip);
	void Fail(const QString &message);

	QString FileHash(const QString &path);
	QString CacheDir() const;
	static QString LocalPath(const QJsonObject &item);

	void Pull(qint64 rev, const QJsonObject &content);
	void Push(qint64 baseRev);
	void UploadFiles(QJsonObject content, std::function<void(QJsonObject)> done);
	void DownloadFiles(QJsonObject content, std::function<void(QJsonObject)> done);

public:
	ChurchSync(ChurchMode *mode, OBSBasic *main);

	/* The Sync button, at the right end of the Scenes toolbar. */
	void Attach(QToolBar *toolbar);
	/* The account's menu (sign in, or sync now and sign out), from the profile icon on the Slides bar. */
	void ShowAccountMenu();
	/* The signed-in account's email; empty when signed out. */
	QString SignedInEmail() const;
	QString Email() const;

signals:
	void accountChanged();

public slots:
	void SyncNow(bool quiet = false);
	/* The content changed here: send it to the account shortly. */
	void ContentEdited();
	/* OBS is closing: send what changed here, waiting a little for it. */
	void FlushBeforeExit();
	/* Takes everything from the account again (this computer's own changes give way). */
	void DownloadAll();
	void SignIn();
	void SignOut();
};
