/******************************************************************************
    OBS Church — account and sync.

    The account keeps one content document with a revision number, and the
    files it uses under their SHA-256. A sync:
      - nothing changed on either side: done;
      - only the account changed: download its files, then take its content;
      - only this computer changed: upload new files, then save the content
        (naming the revision it was based on — the server refuses it if the
        account moved on meanwhile, and that becomes the next case);
      - both changed: ask which to keep.

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 2 of the License, or
    (at your option) any later version.
******************************************************************************/

#include "ChurchSync.hpp"
#include "ChurchMode.hpp"

#include <OBSApp.hpp>
#include <widgets/OBSBasic.hpp>

#include <qt-wrappers.hpp>
#include <util/platform.h>

#include <QCryptographicHash>
#include <QDateTime>
#include <QDialog>
#include <QDialogButtonBox>
#include <QDir>
#include <QFile>
#include <QFileInfo>
#include <QFormLayout>
#include <QHBoxLayout>
#include <QJsonArray>
#include <QJsonDocument>
#include <QLabel>
#include <QLineEdit>
#include <QCursor>
#include <QEventLoop>
#include <QElapsedTimer>
#include <QMenu>
#include <QMessageBox>
#include <QNetworkAccessManager>
#include <QNetworkReply>
#include <QNetworkRequest>
#include <QPushButton>
#include <QSaveFile>
#include <QTimer>
#include <QToolBar>
#include <QToolButton>
#include <QVBoxLayout>

#include <memory>
#include <vector>

#include "moc_ChurchSync.cpp"

namespace {

const char *CONFIG_SECTION = "Church";
const char *DEFAULT_SERVER = "https://obs-sync.bolccop.org";
/* The account keeps files of at most 100 MB; bigger ones stay on the computer that has them. */
const qint64 MAX_FILE_BYTES = 100LL * 1024 * 1024;

bool IsLocalFile(const QString &path)
{
	return !path.isEmpty() && !path.startsWith("http://", Qt::CaseInsensitive) &&
	       !path.startsWith("https://", Qt::CaseInsensitive);
}

/* Apply the same file handling to the source itself, every further video of a video item and every
 * card attachment. */
QJsonObject MapCardFiles(QJsonObject item, const std::function<QJsonObject(QJsonObject)> &map)
{
	item = map(item);
	QJsonArray playlist = item.value("playlist").toArray();
	for (int i = 0; i < playlist.size(); i++) playlist[i] = map(playlist[i].toObject());
	if (!playlist.isEmpty()) item["playlist"] = playlist;
	QJsonObject cards = item.value("cardMedia").toObject();
	for (auto it = cards.begin(); it != cards.end(); ++it) {
		QJsonArray tracks = it.value().toArray();
		for (int i = 0; i < tracks.size(); i++) tracks[i] = map(tracks[i].toObject());
		it.value() = tracks;
	}
	if (!cards.isEmpty()) item["cardMedia"] = cards;
	return item;
}

/* The server's error code as a sentence. */
QString ErrorText(const QByteArray &body, QNetworkReply::NetworkError network)
{
	QString code = QJsonDocument::fromJson(body).object().value("error").toString();
	if (code == "wrong-login") {
		return QTStr("Church.Sync.WrongLogin");
	}
	if (code == "email-taken") {
		return QTStr("Church.Sync.EmailTaken");
	}
	if (code == "weak-password") {
		return QTStr("Church.Sync.WeakPassword");
	}
	if (code == "invalid-email") {
		return QTStr("Church.Sync.InvalidEmail");
	}
	if (code == "signed-out") {
		return QTStr("Church.Sync.SignedOut");
	}
	if (network != QNetworkReply::NoError && code.isEmpty()) {
		return QTStr("Church.Sync.Offline");
	}
	return code.isEmpty() ? QTStr("Church.Sync.Failed") : code;
}

} // namespace

ChurchSync::ChurchSync(ChurchMode *mode_, OBSBasic *main_) : QObject(mode_), mode(mode_), main(main_)
{
	net = new QNetworkAccessManager(this);
}

QString ChurchSync::Server() const
{
	const char *server = config_get_string(App()->GetUserConfig(), CONFIG_SECTION, "SyncServer");
	return QString::fromUtf8(server && *server ? server : DEFAULT_SERVER);
}

QString ChurchSync::Token() const
{
	const char *token = config_get_string(App()->GetUserConfig(), CONFIG_SECTION, "SyncToken");
	return QString::fromUtf8(token ? token : "");
}

QString ChurchSync::Email() const
{
	const char *email = config_get_string(App()->GetUserConfig(), CONFIG_SECTION, "SyncEmail");
	return QString::fromUtf8(email ? email : "");
}

/* The account revision this computer's content was last in step with (per account). */
qint64 ChurchSync::BaseRev() const
{
	std::string key = "SyncRev." + Email().toStdString();
	return config_get_int(App()->GetUserConfig(), CONFIG_SECTION, key.c_str());
}

void ChurchSync::SetBaseRev(qint64 rev)
{
	std::string key = "SyncRev." + Email().toStdString();
	config_set_int(App()->GetUserConfig(), CONFIG_SECTION, key.c_str(), rev);
	config_save_safe(App()->GetUserConfig(), "tmp", nullptr);
}

QString ChurchSync::SyncedHash() const
{
	std::string key = "SyncHash." + Email().toStdString();
	const char *hash = config_get_string(App()->GetUserConfig(), CONFIG_SECTION, key.c_str());
	return QString::fromUtf8(hash ? hash : "");
}

void ChurchSync::SetSyncedHash(const QString &hash)
{
	std::string key = "SyncHash." + Email().toStdString();
	config_set_string(App()->GetUserConfig(), CONFIG_SECTION, key.c_str(), QT_TO_UTF8(hash));
	config_save_safe(App()->GetUserConfig(), "tmp", nullptr);
}

QString ChurchSync::ContentHash(const QJsonObject &content)
{
	QByteArray bytes = QJsonDocument(content).toJson(QJsonDocument::Compact);
	return QString::fromLatin1(QCryptographicHash::hash(bytes, QCryptographicHash::Sha256).toHex());
}

bool ChurchSync::HasItems(const QJsonObject &content)
{
	for (const QJsonValue &scene : content.value("scenes").toArray()) {
		if (!scene.toObject().value("items").toArray().isEmpty()) {
			return true;
		}
	}
	return false;
}

bool ChurchSync::Dirty() const
{
	return config_get_bool(App()->GetUserConfig(), CONFIG_SECTION, ("SyncDirty." + Email().toStdString()).c_str());
}

void ChurchSync::SetDirty(bool dirty)
{
	config_t *config = App()->GetUserConfig();
	config_set_bool(config, CONFIG_SECTION, ("SyncDirty." + Email().toStdString()).c_str(), dirty);
	config_save_safe(config, "tmp", nullptr);
}

void ChurchSync::ContentEdited()
{
	if (Token().isEmpty() || SyncedHash().isEmpty()) {
		return;
	}
	/* Only a real difference from what was last synced (an edit undone is none). */
	const QJsonObject local = mode->ExportContent();
	if (ContentHash(local) == SyncedHash() || !HasItems(local)) {
		return;
	}
	SetDirty(true);
	if (!pushTimer) {
		pushTimer = new QTimer(this);
		pushTimer->setSingleShot(true);
		pushTimer->setInterval(5000);
		connect(pushTimer.data(), &QTimer::timeout, this, [this]() {
			if (busy) {
				pushTimer->start();
			} else {
				SyncNow(true);
			}
		});
	}
	pushTimer->start();
}

void ChurchSync::FlushBeforeExit()
{
	if (Token().isEmpty() || !Dirty()) {
		return;
	}
	if (!busy) {
		SyncNow(true);
	}
	/* Wait for the upload (files and all) — at most half a minute, so closing never hangs long. */
	QEventLoop loop;
	QTimer poll;
	poll.setInterval(100);
	QElapsedTimer waited;
	waited.start();
	connect(&poll, &QTimer::timeout, &loop, [&]() {
		if (!busy || waited.elapsed() > 30000) {
			loop.quit();
		}
	});
	poll.start();
	loop.exec();
}

bool ChurchSync::LocalChanged() const
{
	QJsonObject local = mode->ExportContent();
	QString synced = SyncedHash();
	if (synced.isEmpty()) {
		/* Never synced here: only items count as something to keep. */
		for (const QJsonValue &scene : local.value("scenes").toArray()) {
			if (!scene.toObject().value("items").toArray().isEmpty()) {
				return true;
			}
		}
		return false;
	}
	return ContentHash(local) != synced;
}

void ChurchSync::Attach(QToolBar *toolbar)
{
	/* Beside the toolbar rather than in it: a narrow Scenes dock would fold it into the overflow menu. */
	QWidget *row = new QWidget();
	QHBoxLayout *rowLayout = new QHBoxLayout(row);
	rowLayout->setContentsMargins(0, 0, 4, 0);
	rowLayout->setSpacing(4);
	if (QWidget *parent = toolbar->parentWidget()) {
		if (QBoxLayout *layout = qobject_cast<QBoxLayout *>(parent->layout())) {
			int index = layout->indexOf(toolbar);
			layout->insertWidget(index, row);
		}
	}
	rowLayout->addWidget(toolbar, 1);

	/* Only "Sync" here; signing in and out is the profile icon's, on the Slides bar. */
	button = new QToolButton();
	button->setObjectName("churchSyncButton");
	button->setToolButtonStyle(Qt::ToolButtonTextOnly);
	connect(button.data(), &QToolButton::clicked, this, [this]() { SyncNow(false); });
	rowLayout->addWidget(button);

	SetStatus(QTStr("Church.Sync.Button"), QString());

	/* Online and signed in: pick up the account at startup, then follow changes. */
	autoTimer = new QTimer(this);
	autoTimer->setInterval(60 * 1000);
	connect(autoTimer.data(), &QTimer::timeout, this, [this]() {
		if (!Token().isEmpty() && !busy) {
			SyncNow(true);
		}
	});
	autoTimer->start();
	QTimer::singleShot(4000, this, [this]() {
		if (!Token().isEmpty()) {
			SyncNow(true);
		}
	});
}

void ChurchSync::SetStatus(const QString &text, const QString &tip)
{
	if (!button) {
		return;
	}
	bool signedIn = !Token().isEmpty();
	button->setText(text);
	button->setEnabled(signedIn);
	button->setToolTip(signedIn ? (tip.isEmpty() ? QTStr("Church.Sync.Tip") : tip) : QTStr("Church.Sync.SignInFromProfile"));
}

QString ChurchSync::SignedInEmail() const
{
	return Token().isEmpty() ? QString() : Email();
}

void ChurchSync::ShowAccountMenu()
{
	QMenu menu(main);
	if (Token().isEmpty()) {
		menu.addAction(QTStr("Church.Sync.SignIn"), this, &ChurchSync::SignIn);
	} else {
		QAction *who = menu.addAction(QTStr("Church.Sync.SignedInAs").arg(Email()));
		who->setEnabled(false);
		menu.addAction(QTStr("Church.Sync.Now"), this, [this]() { SyncNow(false); });
		menu.addAction(QTStr("Church.Sync.DownloadAll"), this, &ChurchSync::DownloadAll);
		menu.addSeparator();
		menu.addAction(QTStr("Church.Sync.SignOut"), this, &ChurchSync::SignOut);
	}
	menu.exec(QCursor::pos());
}

void ChurchSync::Fail(const QString &message)
{
	busy = false;
	SetStatus(QTStr("Church.Sync.ButtonError"), message);
	blog(LOG_WARNING, "[Church] sync: %s", QT_TO_UTF8(message));
}

QNetworkReply *ChurchSync::Request(const QByteArray &verb, const QString &path, const QByteArray &body,
				   const QByteArray &type)
{
	QNetworkRequest request(QUrl(Server() + path));
	request.setHeader(QNetworkRequest::ContentTypeHeader, type);
	request.setRawHeader("Authorization", "Bearer " + Token().toUtf8());
	request.setTransferTimeout(120 * 1000);
	return net->sendCustomRequest(request, verb, body);
}

/* ---------------------------- account ----------------------------------- */

void ChurchSync::SignIn()
{
	QDialog dialog(main);
	dialog.setWindowTitle(QTStr("Church.Sync.SignInTitle"));
	QVBoxLayout *layout = new QVBoxLayout(&dialog);

	QLabel *intro = new QLabel(QTStr("Church.Sync.SignInIntro"));
	intro->setWordWrap(true);
	layout->addWidget(intro);

	QFormLayout *form = new QFormLayout();
	QLineEdit *email = new QLineEdit(Email());
	QLineEdit *password = new QLineEdit();
	password->setEchoMode(QLineEdit::Password);
	form->addRow(QTStr("Church.Sync.Email"), email);
	form->addRow(QTStr("Church.Sync.Password"), password);
	layout->addLayout(form);

	QLabel *message = new QLabel();
	message->setWordWrap(true);
	message->setStyleSheet("color: #ff7a6e;");
	layout->addWidget(message);

	QDialogButtonBox *buttons = new QDialogButtonBox();
	QPushButton *signIn = buttons->addButton(QTStr("Church.Sync.SignIn"), QDialogButtonBox::AcceptRole);
	QPushButton *create = buttons->addButton(QTStr("Church.Sync.Create"), QDialogButtonBox::ActionRole);
	buttons->addButton(QDialogButtonBox::Cancel);
	signIn->setDefault(true);
	layout->addWidget(buttons);
	connect(buttons, &QDialogButtonBox::rejected, &dialog, &QDialog::reject);

	auto submit = [&, this](const char *path) {
		signIn->setEnabled(false);
		create->setEnabled(false);
		message->setText(QTStr("Church.Sync.Working"));
		QJsonObject body{{"email", email->text().trimmed()}, {"password", password->text()}};
		QNetworkRequest request(QUrl(Server() + path));
		request.setHeader(QNetworkRequest::ContentTypeHeader, "application/json");
		request.setTransferTimeout(30 * 1000);
		QNetworkReply *reply = net->post(request, QJsonDocument(body).toJson(QJsonDocument::Compact));
		connect(reply, &QNetworkReply::finished, &dialog, [&, reply, this]() {
			reply->deleteLater();
			QByteArray data = reply->readAll();
			signIn->setEnabled(true);
			create->setEnabled(true);
			if (reply->error() != QNetworkReply::NoError) {
				message->setText(ErrorText(data, reply->error()));
				return;
			}
			QJsonObject result = QJsonDocument::fromJson(data).object();
			config_t *config = App()->GetUserConfig();
			config_set_string(config, CONFIG_SECTION, "SyncToken", QT_TO_UTF8(result.value("token").toString()));
			config_set_string(config, CONFIG_SECTION, "SyncEmail", QT_TO_UTF8(result.value("email").toString()));
			config_save_safe(config, "tmp", nullptr);
			dialog.accept();
		});
	};
	connect(signIn, &QPushButton::clicked, &dialog, [&]() { submit("/api/login"); });
	connect(create, &QPushButton::clicked, &dialog, [&]() { submit("/api/register"); });
	/* The accept role would close the dialog before the answer comes back. */
	disconnect(buttons, &QDialogButtonBox::accepted, &dialog, &QDialog::accept);

	if (dialog.exec() == QDialog::Accepted) {
		SetStatus(QTStr("Church.Sync.Button"), QTStr("Church.Sync.Tip"));
		emit accountChanged();
		SyncNow(false);
	}
}

void ChurchSync::SignOut()
{
	config_t *config = App()->GetUserConfig();
	config_remove_value(config, CONFIG_SECTION, "SyncToken");
	config_save_safe(config, "tmp", nullptr);
	SetStatus(QTStr("Church.Sync.Button"), QTStr("Church.Sync.SignInTip"));
	emit accountChanged();
}

/* ---------------------------- sync -------------------------------------- */

void ChurchSync::SyncNow(bool quiet)
{
	if (busy) {
		return;
	}
	if (Token().isEmpty()) {
		if (!quiet) {
			SignIn();
		}
		return;
	}
	busy = true;
	SetStatus(QTStr("Church.Sync.ButtonBusy"), QTStr("Church.Sync.Working"));

	QNetworkReply *reply = Request("GET", "/api/content");
	connect(reply, &QNetworkReply::finished, this, [this, reply, quiet]() {
		reply->deleteLater();
		QByteArray data = reply->readAll();
		if (reply->error() != QNetworkReply::NoError) {
			if (reply->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt() == 401) {
				SignOut();
			}
			Fail(ErrorText(data, reply->error()));
			return;
		}
		QJsonObject remote = QJsonDocument::fromJson(data).object();
		qint64 remoteRev = remote.value("rev").toInteger();
		/* Changed here means edited here by hand: OBS tidying up (fuller file paths, layouts) never stops
		 * the account's newer content from coming in. */
		const bool neverSynced = SyncedHash().isEmpty();
		bool localChanged = neverSynced ? LocalChanged() : (Dirty() && LocalChanged());
		bool remoteChanged = remoteRev != BaseRev();
		qint64 base = BaseRev();
		const bool askNow = !quiet || startupSync;
		startupSync = false;
		if (!neverSynced && !Dirty() && !remoteChanged && LocalChanged()) {
			/* Only OBS's own tidying: bring the account in line quietly. */
			localChanged = true;
		}

		if (quiet && localChanged && !HasItems(mode->ExportContent()) && HasItems(remote.value("content").toObject())) {
			/* No slides here but slides in the account: never wipe it on our own — take the account's. */
			blog(LOG_WARNING, "[Church] sync: no slides here; not sending that over the account's");
			localChanged = false;
			remoteChanged = true;
		}

		if (remoteRev == 0) {
			Push(0);
		} else if (!remoteChanged && !localChanged) {
			busy = false;
			SetStatus(QTStr("Church.Sync.Button"),
				  QTStr("Church.Sync.UpToDate").arg(QDateTime::currentDateTime().toString("HH:mm")));
		} else if (remoteChanged && !localChanged) {
			Pull(remoteRev, remote.value("content").toObject());
		} else if (!remoteChanged && localChanged) {
			Push(base);
		} else {
			/* Both sides changed. */
			QMessageBox box(main);
			box.setWindowTitle(QTStr("Church.Sync.ConflictTitle"));
			box.setText(QTStr("Church.Sync.ConflictText"));
			QPushButton *mine = box.addButton(QTStr("Church.Sync.KeepMine"), QMessageBox::AcceptRole);
			QPushButton *theirs = box.addButton(QTStr("Church.Sync.KeepAccount"), QMessageBox::DestructiveRole);
			box.addButton(QMessageBox::Cancel);
			if (!askNow) {
				/* Never decide this alone, and never pop up during a service: wait for a click on Sync. */
				busy = false;
				SetStatus(QTStr("Church.Sync.ButtonError"), QTStr("Church.Sync.ConflictWaiting"));
				return;
			}
			box.exec();
			if (box.clickedButton() == mine) {
				Push(remoteRev);
			} else if (box.clickedButton() == theirs) {
				Pull(remoteRev, remote.value("content").toObject());
			} else {
				busy = false;
				SetStatus(QTStr("Church.Sync.Button"), QTStr("Church.Sync.Tip"));
			}
		}
	});
}

void ChurchSync::DownloadAll()
{
	if (busy || Token().isEmpty()) {
		return;
	}
	if (QMessageBox::question(main, QTStr("Church.Sync.DownloadAll"), QTStr("Church.Sync.DownloadAllConfirm")) !=
	    QMessageBox::Yes) {
		return;
	}
	busy = true;
	SetStatus(QTStr("Church.Sync.ButtonBusy"), QTStr("Church.Sync.Working"));
	QNetworkReply *reply = Request("GET", "/api/content");
	connect(reply, &QNetworkReply::finished, this, [this, reply]() {
		reply->deleteLater();
		QByteArray data = reply->readAll();
		if (reply->error() != QNetworkReply::NoError) {
			Fail(ErrorText(data, reply->error()));
			return;
		}
		QJsonObject remote = QJsonDocument::fromJson(data).object();
		if (remote.value("rev").toInteger() == 0) {
			busy = false;
			SetStatus(QTStr("Church.Sync.Button"), QTStr("Church.Sync.Tip"));
			return;
		}
		Pull(remote.value("rev").toInteger(), remote.value("content").toObject());
	});
}

void ChurchSync::Pull(qint64 rev, const QJsonObject &content)
{
	const QString localHash = ContentHash(mode->ExportContent());
	DownloadFiles(content, [this, rev, localHash](QJsonObject ready) {
		/* A user may edit while large files download. Keep those edits for conflict resolution. */
		if (ContentHash(mode->ExportContent()) != localHash) {
			busy = false;
			SetStatus(QTStr("Church.Sync.ButtonError"), QTStr("Church.Sync.ConflictWaiting"));
			return;
		}
		mode->ImportContent(ready);
		SetBaseRev(rev);
		SetSyncedHash(ContentHash(mode->ExportContent()));
		SetDirty(false);
		QTimer::singleShot(0, this, [this]() {
			busy = false;
			SetStatus(QTStr("Church.Sync.Button"),
				  QTStr("Church.Sync.UpToDate").arg(QDateTime::currentDateTime().toString("HH:mm")));
		});
	});
}

void ChurchSync::Push(qint64 baseRev)
{
	QJsonObject local = mode->ExportContent();
	QString localHash = ContentHash(local);
	UploadFiles(local, [this, baseRev, localHash](QJsonObject content) {
		QJsonObject body{{"baseRev", baseRev}, {"content", content}};
		QNetworkReply *reply = Request("PUT", "/api/content", QJsonDocument(body).toJson(QJsonDocument::Compact));
		connect(reply, &QNetworkReply::finished, this, [this, reply, localHash]() {
			reply->deleteLater();
			QByteArray data = reply->readAll();
			int status = reply->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt();
			if (status == 409) {
				/* The account moved on meanwhile: start over (asking only if this sync may ask). */
				busy = false;
				SyncNow(true);
				return;
			}
			if (reply->error() != QNetworkReply::NoError) {
				Fail(ErrorText(data, reply->error()));
				return;
			}
			SetBaseRev(QJsonDocument::fromJson(data).object().value("rev").toInteger());
			SetSyncedHash(localHash);
			SetDirty(false);
			busy = false;
			SetStatus(QTStr("Church.Sync.Button"),
				  QTStr("Church.Sync.UpToDate").arg(QDateTime::currentDateTime().toString("HH:mm")));
		});
	});
}

/* ---------------------------- files ------------------------------------- */

QString ChurchSync::LocalPath(const QJsonObject &item)
{
	QString kind = item.value("kind").toString();
	QString path = (kind == "video" || kind == "audio") ? item.value("url").toString() : item.value("path").toString();
	return (kind == "image" || kind == "ppt" || kind == "video" || kind == "audio") && IsLocalFile(path) ? path : QString();
}

QString ChurchSync::FileHash(const QString &path)
{
	QFileInfo info(path);
	if (!info.exists()) {
		return {};
	}
	auto cached = hashCache.find(path);
	if (cached != hashCache.end() && std::get<0>(cached->second) == info.lastModified().toMSecsSinceEpoch() &&
	    std::get<1>(cached->second) == info.size()) {
		return std::get<2>(cached->second);
	}
	QFile file(path);
	if (!file.open(QIODevice::ReadOnly)) {
		return {};
	}
	QCryptographicHash hash(QCryptographicHash::Sha256);
	hash.addData(&file);
	QString hex = QString::fromLatin1(hash.result().toHex());
	hashCache[path] = {info.lastModified().toMSecsSinceEpoch(), info.size(), hex};
	return hex;
}

QString ChurchSync::CacheDir() const
{
	BPtr<char> path = GetAppConfigPathPtr("obs-studio/church-presenter/files");
	QDir().mkpath(QT_UTF8(path.Get()));
	/* A full path: in portable mode OBS names its config folder relative to the program ("../../config"),
	 * which the slide pages cannot open. */
	return QDir::cleanPath(QFileInfo(QT_UTF8(path.Get())).absoluteFilePath());
}

/* Every local file the items use, uploaded once; the content then names each by its hash. */
void ChurchSync::UploadFiles(QJsonObject content, std::function<void(QJsonObject)> done)
{
	struct Job {
		QString path, hash;
	};
	auto jobs = std::make_shared<std::vector<Job>>();

	QJsonArray scenes = content.value("scenes").toArray();
	for (int s = 0; s < scenes.size(); s++) {
		QJsonObject scene = scenes[s].toObject();
		QJsonArray items = scene.value("items").toArray();
		for (int i = 0; i < items.size(); i++) {
			items[i] = MapCardFiles(items[i].toObject(), [this, jobs](QJsonObject file) {
				QString path = LocalPath(file);
				if (!path.isEmpty() && QFileInfo(path).size() > MAX_FILE_BYTES) {
					blog(LOG_INFO, "[Church] sync: %s is over 100 MB; it stays on this computer",
					     QT_TO_UTF8(QFileInfo(path).fileName()));
					return file;
				}
				QString hash = path.isEmpty() ? QString() : FileHash(path);
				if (!hash.isEmpty()) {
					file["fileHash"] = hash;
					file["fileName"] = QFileInfo(path).fileName();
					jobs->push_back({path, hash});
				}
				return file;
			});
		}
		scene["items"] = items;
		scenes[s] = scene;
	}
	content["scenes"] = scenes;

	auto step = std::make_shared<std::function<void(size_t)>>();
	*step = [this, jobs, step, content, done](size_t index) {
		if (index >= jobs->size()) {
			done(content);
			return;
		}
		const Job job = (*jobs)[index];
		SetStatus(QTStr("Church.Sync.ButtonBusy"),
			  QTStr("Church.Sync.Uploading").arg(QFileInfo(job.path).fileName()));
		QNetworkReply *head = Request("HEAD", "/api/files/" + job.hash);
		connect(head, &QNetworkReply::finished, this, [this, head, job, step, index]() {
			head->deleteLater();
			if (head->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt() == 200) {
				(*step)(index + 1);
				return;
			}
			QFile *file = new QFile(job.path);
			if (!file->open(QIODevice::ReadOnly)) {
				delete file;
				(*step)(index + 1);
				return;
			}
			QNetworkRequest request(QUrl(Server() + "/api/files/" + job.hash));
			request.setHeader(QNetworkRequest::ContentTypeHeader, "application/octet-stream");
			request.setRawHeader("Authorization", "Bearer " + Token().toUtf8());
			QNetworkReply *put = net->put(request, file);
			file->setParent(put);
			connect(put, &QNetworkReply::finished, this, [this, put, step, index]() {
				put->deleteLater();
				if (put->error() != QNetworkReply::NoError) {
					Fail(ErrorText(put->readAll(), put->error()));
					return;
				}
				(*step)(index + 1);
			});
		});
	};
	(*step)(0);
}

/* The account's files, into this computer's cache (unless the same file is already at its path). */
void ChurchSync::DownloadFiles(QJsonObject content, std::function<void(QJsonObject)> done)
{
	struct Job {
		QString hash, target;
	};
	auto jobs = std::make_shared<std::vector<Job>>();
	QString cache = CacheDir();

	QJsonArray scenes = content.value("scenes").toArray();
	for (int s = 0; s < scenes.size(); s++) {
		QJsonObject scene = scenes[s].toObject();
		QJsonArray items = scene.value("items").toArray();
		for (int i = 0; i < items.size(); i++) {
			items[i] = MapCardFiles(items[i].toObject(), [this, jobs, cache](QJsonObject file) {
				QString hash = file.value("fileHash").toString();
				if (hash.isEmpty()) return file;
				QString path = LocalPath(file);
				if (!path.isEmpty() && !QDir::isRelativePath(path) && FileHash(path) == hash) return file;
				QString ext = QFileInfo(file.value("fileName").toString()).suffix();
				QString target = QDir::fromNativeSeparators(cache + "/" + hash + (ext.isEmpty() ? "" : "." + ext));
				QString kind = file.value("kind").toString();
				file[kind == "video" || kind == "audio" ? "url" : "path"] = target;
				if (!QFileInfo::exists(target)) jobs->push_back({hash, target});
				return file;
			});
		}
		scene["items"] = items;
		scenes[s] = scene;
	}
	content["scenes"] = scenes;

	auto step = std::make_shared<std::function<void(size_t)>>();
	*step = [this, jobs, step, content, done](size_t index) {
		if (index >= jobs->size()) {
			done(content);
			return;
		}
		const Job job = (*jobs)[index];
		SetStatus(QTStr("Church.Sync.ButtonBusy"), QTStr("Church.Sync.Downloading"));
		QNetworkReply *reply = Request("GET", "/api/files/" + job.hash);
		connect(reply, &QNetworkReply::finished, this, [this, reply, job, step, index]() {
			reply->deleteLater();
			if (reply->error() != QNetworkReply::NoError) {
				Fail(ErrorText(reply->readAll(), reply->error()));
				return;
			}
			QByteArray bytes = reply->readAll();
			QCryptographicHash hash(QCryptographicHash::Sha256);
			hash.addData(bytes);
			if (QString::fromLatin1(hash.result().toHex()) == job.hash) {
				QSaveFile file(job.target);
				if (file.open(QIODevice::WriteOnly)) {
					file.write(bytes);
					file.commit();
				}
			}
			(*step)(index + 1);
		});
	};
	(*step)(0);
}
