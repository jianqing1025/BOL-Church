/******************************************************************************
    OBS Church — the church layout: slides on the left, three screens on the
    right, and a Recording & Streaming section that picks what goes out.

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 2 of the License, or
    (at your option) any later version.
******************************************************************************/

#pragma once

#include <obs.hpp>
#include <obs-frontend-api.h>

#include <QJsonObject>
#include <QObject>
#include <QPointer>
#include <QString>

#include <array>
#include <map>
#include <vector>

class OBSBasic;
class OBSDock;
class QCefWidget;
class QHBoxLayout;
class QMenu;
class QSplitter;
class QTimer;
class ChurchScreen;
class ChurchSceneDisplay;
class ChurchSync;
class VolumeControl;

class ChurchMode : public QObject {
	Q_OBJECT

public:
	/* What can be streamed and recorded; each is a scene of its own, kept out of the Scenes list. */
	enum class Feed { Main = 0, Camera = 1, Pip = 2, Side = 3 };
	static constexpr size_t FEEDS = 4;

	explicit ChurchMode(OBSBasic *main);
	~ChurchMode();

	/* Is the church layout on? (On by default.) */
	static bool Enabled();
	/* The "Church Slides" source type; before the scene collection loads. */
	static void RegisterSources();

	/* After the scene collection has loaded, before the window is shown. */
	void Init();
	/* View ▸ Docks ▸ Reset UI. */
	void ResetDocks();
	/* An item's properties: open it in the slide editor. */
	void EditItem(const std::string &uuid);

	/* For the account sync: the church content (scenes and their slide items), and putting it back. */
	QJsonObject ExportContent() const;
	void ImportContent(const QJsonObject &content);
	/* "2026-11-01 Live - <sermon title>": the date, and the title of the pulpit/sermon text item. */
	QString StreamTitle() const;

	/* Something the account should hear about changed. */
	quint64 ContentRevision() const { return contentRevision; }

private:
	OBSBasic *main;

	QPointer<QCefWidget> panel;
	QPointer<QSplitter> splitter;
	QPointer<OBSDock> outputDock;
	ChurchSync *sync = nullptr;

	/* Right column: ① the editable preview, ② camera, ③ picture in picture. */
	QPointer<ChurchScreen> previewScreen;
	QPointer<ChurchSceneDisplay> columnCamera, columnPip;
	QPointer<ChurchScreen> columnCameraScreen, columnPipScreen;
	/* Recording & Streaming: one small screen per feed. */
	std::array<QPointer<ChurchSceneDisplay>, FEEDS> pickerViews;
	std::array<QPointer<ChurchScreen>, FEEDS> pickerScreens;

	std::array<OBSWeakSource, FEEDS> scenes;
	OBSWeakSource camera;
	/* The page that draws the slide on screen; private, shared by every slide item. */
	OBSSource output;
	OBSSignal outputSignal;
	/* The scene whose content is on the main screen (never one of the feeds). */
	OBSWeakSource contentScene;

	/* Recording & Streaming audio mixer: each audio source's gain in the stream and
	 * the recording only (obs_source_set_output_volume); monitoring is untouched. */
	QPointer<QWidget> mixerContainer;
	QHBoxLayout *mixerLayout = nullptr;
	QPointer<QTimer> mixerRefreshTimer;
	std::map<std::string, QPointer<VolumeControl>> mixerControls;
	std::vector<OBSSignal> mixerSignals;

	/* The deck last sent to the panel, to send only changes. */
	QString lastDeck;
	QPointer<QTimer> deckTimer;
	quint64 contentRevision = 0;

	/* The slide on screen now, resent when the output page (re)loads. */
	QString lastShow;
	/* The panel has the keyboard: it pages itself, so the hotkeys stand down. */
	bool panelFocused = false;

	obs_hotkey_id nextHotkey = OBS_INVALID_HOTKEY_ID;
	obs_hotkey_id prevHotkey = OBS_INVALID_HOTKEY_ID;
	obs_hotkey_id blankHotkey = OBS_INVALID_HOTKEY_ID;
	obs_hotkey_id clearHotkey = OBS_INVALID_HOTKEY_ID;

	/* --- scenes --- */
	void EnsureScenes();
	void EnsureOutput();
	OBSSource EnsureCamera();
	OBSSource Scene(Feed feed) const;
	bool IsFeedScene(obs_source_t *scene) const;
	std::vector<OBSSource> ContentScenes() const;
	OBSSource CurrentContent() const;
	void SetContent(obs_source_t *scene);
	void PlaceContent(obs_scene_t *feedScene, obs_source_t *content, Feed feed);
	void ApplyLayout(Feed feed, bool cameraCorner, float cameraShare);
	void HideFeedScenes();
	/* The "Live Video" group at the top of each scene (camera and media, with an opacity filter). */
	void EnsureLiveGroups();
	void SetLiveVideo(const QString &mode);
	bool ensuringGroups = false;

	/* --- layout --- */
	void BuildLayout();
	void BuildOutputDock();
	void BuildSourceButtons();
	void BuildSlideButtons();
	QWidget *BuildOutputMixer();
	static void MixerSourcesChanged(void *data, calldata_t *params);
	void BindViews();
	void UpdateLive();
	/* `byHand`: a click in Recording & Streaming (it cancels a pending automatic switch). */
	void GoLive(Feed feed, bool byHand = false);
	/* Automatic switching: a new slide puts Main on air; a while without one, Camera only. */
	QPointer<QTimer> autoCameraTimer;
	bool AutoSwitch() const;
	void SlideChanged();
	void ShowFeedMenu(Feed feed, ChurchSceneDisplay *view);
	void FillProjectMenu(QMenu *menu, Feed feed);
	void FillPreviewProjectMenu(QMenu *menu);

	/* --- slide items --- */
	QJsonObject BuildDeck() const;
	void SaveItems(const QJsonArray &items, const QString &sceneId);
	void PlaceAfterAnchor(obs_scene_t *scene, obs_sceneitem_t *added);
	/* Where the next new item goes after (the selection, then each item just added). */
	OBSSceneItem insertAnchor;
	OBSSource CreateItem(const QJsonObject &item, obs_scene_t *scene);
	void ImportOldLibrary();

	void RegisterHotkeys();
	void UnregisterHotkeys();
	static void HotkeyPressed(void *data, obs_hotkey_id id, obs_hotkey_t *hotkey, bool pressed);

	void SendToPanel(const QJsonObject &message);
	void SendToOutput(const QString &specJson);

	static void FrontendEvent(enum obs_frontend_event event, void *data);
	static void OutputHostMessage(void *data, calldata_t *params);

private slots:
	void PanelMessage(const QString &json);
	void OutputMessage(const QString &json);
	void RefreshDeck();
	void RefreshMixer();
	void QueueMixerRefresh();
	void Nav(int delta);
	void Clear(const QString &what);
};
