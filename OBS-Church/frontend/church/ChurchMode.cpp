/******************************************************************************
    OBS Church — the church layout.

    Left:   the slide area (church-presenter/panel.html in a browser panel): the
            slides of every scene, in Scenes-list order, paged straight through.
    Right:  ① the main screen — the preview, editable as in plain OBS; it shows
            the scene whose slides are being shown — ② the camera, ③ picture in
            picture.
    Dock:   Recording & Streaming — four small screens (Main, Camera, Picture in
            picture, Side by side); the one clicked is what is streamed and
            recorded. Beside them, an audio mixer for the stream and the
            recording only.
    Sources: Text, Scripture, Image, Video and PPT buttons under the list; each
            item is a "Church Slides" source.

    The four feeds are scenes of their own, hidden from the Scenes list: Main,
    Picture in picture and Side by side hold the current scene nested inside
    them (swapped when the slides move on to another scene), so switching what
    is recorded never touches the main screen, and the main screen moving on
    never needs a click in the dock.

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 2 of the License, or
    (at your option) any later version.
******************************************************************************/

#include "ChurchMode.hpp"
#include "ChurchSceneView.hpp"
#include "ChurchSlidesSource.hpp"
#include "ChurchSync.hpp"

#include <OBSApp.hpp>
#include <components/VolumeControl.hpp>
#include <docks/OBSDock.hpp>
#include <utility/platform.hpp>
#include <widgets/OBSBasic.hpp>
#include <widgets/OBSProjector.hpp>

#include <browser-panel.hpp>
#include <qt-wrappers.hpp>
#include <util/platform.h>

#include <QApplication>
#include <QPainter>
#include <QPixmap>
#include <QSvgRenderer>
#include <QClipboard>
#include <QDate>
#include <QStatusBar>
#include <QDir>
#include <QFile>
#include <QFileDialog>
#include <QFileInfo>
#include <QGridLayout>
#include <QHBoxLayout>
#include <QJsonArray>
#include <QJsonDocument>
#include <QLabel>
#include <QMenu>
#include <QPushButton>
#include <QScrollArea>
#include <QSplitter>
#include <QTimer>
#include <QToolButton>
#include <QVBoxLayout>

#include "ui_OBSBasic.h"

#include <algorithm>
#include <set>
#include <string>

#include "moc_ChurchMode.cpp"

extern QCef *cef;

namespace {

const char *CONFIG_SECTION = "Church";

/* A feed scene's private setting, and an item's role inside it. */
const char *FEED_KEY = "church_feed";
const char *ROLE_KEY = "church_role";
const char *FEED_IDS[ChurchMode::FEEDS] = {"main", "camera", "pip", "side"};
const char *FEED_NAMES[ChurchMode::FEEDS] = {"Church.Feed.Main", "Church.Feed.Camera", "Church.Feed.Pip",
					     "Church.Feed.Side"};

#ifdef _WIN32
const char *CAMERA_SOURCE_ID = "dshow_input";
const char *CAMERA_DEVICE_PROPERTY = "video_device_id";
#elif defined(__APPLE__)
const char *CAMERA_SOURCE_ID = "macos-avcapture";
const char *CAMERA_DEVICE_PROPERTY = "device";
#else
const char *CAMERA_SOURCE_ID = "v4l2_input";
const char *CAMERA_DEVICE_PROPERTY = "device_id";
#endif

/* Where the slide pages are installed (data/obs-studio/church-presenter). */
std::string PresenterFile(const char *name)
{
	std::string path;
	if (!GetDataFilePath((std::string("church-presenter/") + name).c_str(), path)) {
		return {};
	}
	return QDir::fromNativeSeparators(QFileInfo(QString::fromStdString(path)).absoluteFilePath()).toStdString();
}

/* obs-browser serves any local file at http://absolute/<path>. */
std::string AbsoluteUrl(const std::string &path)
{
	return "http://absolute/" + path;
}

void Canvas(float &cx, float &cy)
{
	obs_video_info ovi;
	if (obs_get_video_info(&ovi)) {
		cx = float(ovi.base_width);
		cy = float(ovi.base_height);
	} else {
		cx = 1920.0f;
		cy = 1080.0f;
	}
}

void PlaceItem(obs_sceneitem_t *item, float x, float y, float cx, float cy)
{
	vec2 pos;
	vec2 bounds;
	vec2_set(&pos, x, y);
	vec2_set(&bounds, cx, cy);
	obs_sceneitem_defer_update_begin(item);
	obs_sceneitem_set_alignment(item, OBS_ALIGN_LEFT | OBS_ALIGN_TOP);
	obs_sceneitem_set_bounds_type(item, OBS_BOUNDS_SCALE_INNER);
	obs_sceneitem_set_bounds_alignment(item, OBS_ALIGN_CENTER);
	obs_sceneitem_set_bounds(item, &bounds);
	obs_sceneitem_set_pos(item, &pos);
	obs_sceneitem_defer_update_end(item);
}

std::string Role(obs_sceneitem_t *item)
{
	OBSDataAutoRelease data = obs_sceneitem_get_private_settings(item);
	return obs_data_get_string(data, ROLE_KEY);
}

void SetRole(obs_sceneitem_t *item, const char *role)
{
	OBSDataAutoRelease data = obs_sceneitem_get_private_settings(item);
	obs_data_set_string(data, ROLE_KEY, role);
}

OBSSceneItem FindRole(obs_scene_t *scene, const char *role)
{
	struct Find {
		const char *role;
		OBSSceneItem found;
	} find{role, nullptr};
	obs_scene_enum_items(
		scene,
		[](obs_scene_t *, obs_sceneitem_t *item, void *param) {
			Find *f = static_cast<Find *>(param);
			if (Role(item) == f->role) {
				f->found = item;
				return false;
			}
			return true;
		},
		&find);
	return find.found;
}

/* The Church Slides items of a scene, top of the Sources list first (groups opened). */
void CollectItems(obs_scene_t *scene, std::vector<OBSSource> &out)
{
	std::vector<OBSSceneItem> items;
	obs_scene_enum_items(
		scene,
		[](obs_scene_t *, obs_sceneitem_t *item, void *param) {
			static_cast<std::vector<OBSSceneItem> *>(param)->emplace_back(item);
			return true;
		},
		&items);
	for (auto it = items.rbegin(); it != items.rend(); ++it) {
		obs_source_t *source = obs_sceneitem_get_source(*it);
		if (obs_sceneitem_is_group(*it)) {
			CollectItems(obs_sceneitem_group_get_scene(*it), out);
		} else if (ChurchSlides::Is(source)) {
			out.emplace_back(source);
		}
	}
}

QJsonObject ItemJson(obs_source_t *source)
{
	OBSDataAutoRelease settings = obs_source_get_settings(source);
	QJsonObject item = QJsonDocument::fromJson(obs_data_get_string(settings, CHURCH_SLIDES_ITEM)).object();
	item["id"] = QString::fromUtf8(obs_source_get_uuid(source));
	item["name"] = QString::fromUtf8(obs_source_get_name(source));
	return item;
}

std::string UniqueName(const QString &wanted, obs_source_t *self = nullptr)
{
	std::string base = wanted.trimmed().isEmpty() ? std::string(Str("Church.Source.Slides"))
						      : wanted.trimmed().toStdString();
	std::string name = base;
	for (int n = 2;; n++) {
		OBSSourceAutoRelease other = obs_get_source_by_name(name.c_str());
		if (!other || other.Get() == self) {
			return name;
		}
		name = base + " " + std::to_string(n);
	}
}

/* An adaptive grid: four small screens in one row, two rows, or one column — whichever makes them biggest. */
class Tiles : public QWidget {
	std::vector<QWidget *> tiles;
	const int gap = 6;
	const int header = 18;

public:
	explicit Tiles(QWidget *parent = nullptr) : QWidget(parent) { setMinimumSize(200, 120); }
	void Add(QWidget *tile)
	{
		tile->setParent(this);
		tiles.push_back(tile);
	}

protected:
	void resizeEvent(QResizeEvent *) override
	{
		const int n = int(tiles.size());
		if (!n) {
			return;
		}
		int best = 1;
		double bestArea = 0;
		for (int cols : {1, 2, 4}) {
			if (cols > n) {
				continue;
			}
			int rows = (n + cols - 1) / cols;
			double w = double(width() - gap * (cols - 1)) / cols;
			double h = double(height() - gap * (rows - 1)) / rows - header;
			double vw = std::min(w, h * 16.0 / 9.0);
			if (vw > bestArea) {
				bestArea = vw;
				best = cols;
			}
		}
		int cols = best;
		int rows = (n + cols - 1) / cols;
		int w = (width() - gap * (cols - 1)) / cols;
		int h = (height() - gap * (rows - 1)) / rows;
		for (int i = 0; i < n; i++) {
			tiles[i]->setGeometry((i % cols) * (w + gap), (i / cols) * (h + gap), w, h);
		}
	}
};

} // namespace

/* ------------------------------------------------------------------------- */

ChurchMode::ChurchMode(OBSBasic *main_) : QObject(main_), main(main_) {}

ChurchMode::~ChurchMode()
{
	obs_frontend_remove_event_callback(ChurchMode::FrontendEvent, this);
	outputSignal.Disconnect();
	mixerSignals.clear();
	UnregisterHotkeys();
	ChurchSlides::SetEditHandler(nullptr);
}

bool ChurchMode::Enabled()
{
	config_t *config = App()->GetUserConfig();
	if (!config_has_user_value(config, CONFIG_SECTION, "Enabled")) {
		return true;
	}
	return config_get_bool(config, CONFIG_SECTION, "Enabled");
}

void ChurchMode::RegisterSources()
{
	ChurchSlides::Register();
}

void ChurchMode::Init()
{
	OBSBasic::InitBrowserPanelSafeBlock();

	EnsureOutput();
	EnsureScenes();
	BuildLayout();
	BuildOutputDock();
	BuildSourceButtons();
	BuildSlideButtons();

	autoCameraTimer = new QTimer(this);
	autoCameraTimer->setSingleShot(true);
	connect(autoCameraTimer.data(), &QTimer::timeout, this, [this]() {
		if (AutoSwitch()) {
			GoLive(Feed::Camera);
		}
	});

	sync = new ChurchSync(this, main);
	sync->Attach(main->ui->scenesToolbar);

	ChurchSlides::SetEditHandler([this](const std::string &uuid) {
		QMetaObject::invokeMethod(this, [this, uuid]() { EditItem(uuid); }, Qt::QueuedConnection);
	});

	RegisterHotkeys();
	obs_frontend_add_event_callback(ChurchMode::FrontendEvent, this);

	/* Starting to stream: today's title, ready to paste where the stream is named (OBS's own YouTube
	 * dialog fills it in by itself when a YouTube account is connected). */
	connect(main, &OBSBasic::StreamingStarting, this, [this](bool) {
		QString title = StreamTitle();
		QApplication::clipboard()->setText(title);
		main->statusBar()->showMessage(QTStr("Church.StreamTitle.Copied").arg(title), 15000);
	});

	/* Out of studio mode the dock's screens could not choose the program. */
	connect(main, &OBSBasic::PreviewProgramModeChanged, this, [this](bool enabled) {
		if (!enabled) {
			QTimer::singleShot(0, main, [this]() { main->SetPreviewProgramMode(true); });
		}
		QTimer::singleShot(0, this, [this]() {
			BindViews();
			UpdateLive();
		});
	});

	/* Item changes come from many places (the Sources list, undo, sync): watch for them. */
	deckTimer = new QTimer(this);
	deckTimer->setInterval(700);
	connect(deckTimer.data(), &QTimer::timeout, this, &ChurchMode::RefreshDeck);
	deckTimer->start();

	ImportOldLibrary();
	EnsureLiveGroups();
	SetContent(CurrentContent());
	BindViews();
	HideFeedScenes();
	UpdateLive();

	/* After startup settles (a transition still running would refuse the switch): Main goes out. */
	QTimer::singleShot(1000, this, [this]() {
		if (!IsFeedScene(main->GetProgramSource())) {
			GoLive(Feed::Main);
		}
	});
}

/* ---------------------------- scenes ------------------------------------ */

OBSSource ChurchMode::Scene(Feed feed) const
{
	return OBSGetStrongRef(scenes[size_t(feed)]);
}

bool ChurchMode::IsFeedScene(obs_source_t *scene) const
{
	if (!scene) {
		return false;
	}
	for (const OBSWeakSource &weak : scenes) {
		if (OBSGetStrongRef(weak) == scene) {
			return true;
		}
	}
	return false;
}

std::vector<OBSSource> ChurchMode::ContentScenes() const
{
	std::vector<OBSSource> out;
	for (int i = 0; i < main->ui->scenes->count(); i++) {
		OBSScene scene = GetOBSRef<OBSScene>(main->ui->scenes->item(i));
		obs_source_t *source = obs_scene_get_source(scene);
		if (source && !IsFeedScene(source)) {
			out.emplace_back(source);
		}
	}
	return out;
}

OBSSource ChurchMode::CurrentContent() const
{
	OBSSource current = main->GetCurrentSceneSource();
	if (current && !IsFeedScene(current)) {
		return current;
	}
	OBSSource last = OBSGetStrongRef(contentScene);
	if (last) {
		return last;
	}
	std::vector<OBSSource> content = ContentScenes();
	return content.empty() ? nullptr : content.front();
}

void ChurchMode::EnsureOutput()
{
	if (output) {
		return;
	}
	config_t *config = App()->GetUserConfig();
	const std::string file = PresenterFile("output.html");
	float cx, cy;
	Canvas(cx, cy);

	OBSDataAutoRelease settings = obs_data_create();
	obs_data_set_bool(settings, "is_local_file", true);
	obs_data_set_string(settings, "local_file", file.c_str());
	obs_data_set_int(settings, "width", int(cx));
	obs_data_set_int(settings, "height", int(cy));
	/* A video's sound goes through OBS: into the stream and the recording, and to the room's speakers. */
	obs_data_set_bool(settings, "reroute_audio", true);
	obs_data_set_bool(settings, "shutdown", false);
	obs_data_set_bool(settings, "restart_when_active", false);

	OBSSourceAutoRelease page = obs_source_create_private("browser_source", Str("Church.SlidesAudio"), settings);
	output = page.Get();
	if (!output) {
		return;
	}

	config_set_default_double(config, CONFIG_SECTION, "SlidesVolume", 1.0);
	config_set_default_double(config, CONFIG_SECTION, "SlidesOutputVolume", 1.0);
	config_set_default_bool(config, CONFIG_SECTION, "SlidesMonitor", true);
	obs_source_set_volume(output, float(config_get_double(config, CONFIG_SECTION, "SlidesVolume")));
	obs_source_set_output_volume(output, float(config_get_double(config, CONFIG_SECTION, "SlidesOutputVolume")));
	obs_source_set_output_muted(output, config_get_bool(config, CONFIG_SECTION, "SlidesOutputMuted"));
	obs_source_set_monitoring_enabled(output, config_get_bool(config, CONFIG_SECTION, "SlidesMonitor"));

	outputSignal.Connect(obs_source_get_signal_handler(output), "host_message", ChurchMode::OutputHostMessage,
			     this);
	ChurchSlides::SetOutput(output);
	/* Always on screen as far as the browser is concerned: a hidden page stops painting, and an
	 * item that turns live must show its slide at once. */
	obs_source_inc_showing(output);
	obs_source_inc_active(output);
}

OBSSource ChurchMode::EnsureCamera()
{
	OBSSource existing = OBSGetStrongRef(camera);
	if (existing) {
		return existing;
	}

	/* The camera the feeds already use, if the collection has them. */
	for (Feed feed : {Feed::Camera, Feed::Pip, Feed::Side}) {
		OBSSource scene = Scene(feed);
		if (!scene) {
			continue;
		}
		OBSSceneItem item = FindRole(obs_scene_from_source(scene), "camera");
		if (item) {
			OBSSource source = obs_sceneitem_get_source(item);
			camera = OBSGetWeakRef(source);
			return source;
		}
	}

	OBSDataAutoRelease settings = obs_data_create();
	/* The first camera found; it can be changed in the camera's properties. */
	obs_properties_t *props = obs_get_source_properties(CAMERA_SOURCE_ID);
	if (props) {
		obs_property_t *list = obs_properties_get(props, CAMERA_DEVICE_PROPERTY);
		size_t count = list ? obs_property_list_item_count(list) : 0;
		for (size_t i = 0; i < count; i++) {
			const char *id = obs_property_list_item_string(list, i);
			if (id && *id) {
				obs_data_set_string(settings, CAMERA_DEVICE_PROPERTY, id);
				break;
			}
		}
		obs_properties_destroy(props);
	}

	OBSSourceAutoRelease created =
		obs_source_create(CAMERA_SOURCE_ID, UniqueName(QTStr("Church.Camera")).c_str(), settings, nullptr);
	OBSSource source = created.Get();
	if (source) {
		camera = OBSGetWeakRef(source);
	}
	return source;
}

void ChurchMode::EnsureScenes()
{
	for (OBSWeakSource &weak : scenes) {
		weak = nullptr;
	}
	camera = nullptr;

	/* Feed scenes are found by their private tag, not their name (the name follows the language). */
	auto find = [](void *param, obs_source_t *source) {
		auto *self = static_cast<ChurchMode *>(param);
		OBSDataAutoRelease priv = obs_source_get_private_settings(source);
		const char *feed = obs_data_get_string(priv, FEED_KEY);
		for (size_t i = 0; i < FEEDS; i++) {
			if (strcmp(feed, FEED_IDS[i]) == 0 && !OBSGetStrongRef(self->scenes[i])) {
				self->scenes[i] = OBSGetWeakRef(source);
			}
		}
		return true;
	};
	obs_enum_scenes(find, this);

	float cx, cy;
	Canvas(cx, cy);
	bool created = false;
	for (size_t i = 0; i < FEEDS; i++) {
		if (OBSGetStrongRef(scenes[i])) {
			continue;
		}
		OBSSceneAutoRelease scene = obs_scene_create(UniqueName(QTStr(FEED_NAMES[i])).c_str());
		obs_source_t *source = obs_scene_get_source(scene);
		OBSDataAutoRelease priv = obs_source_get_private_settings(source);
		obs_data_set_string(priv, FEED_KEY, FEED_IDS[i]);
		scenes[i] = OBSGetWeakRef(source);
		created = true;

		Feed feed = Feed(i);
		if (feed != Feed::Main) {
			OBSSource cam = EnsureCamera();
			if (cam) {
				obs_sceneitem_t *item = obs_scene_add(scene, cam);
				SetRole(item, "camera");
				PlaceItem(item, 0.0f, 0.0f, cx, cy);
			}
		}
	}
	EnsureCamera();

	if (created) {
		ApplyLayout(Feed::Pip, true, 0.32f);
		ApplyLayout(Feed::Side, false, 0.30f);
		main->SaveProject();
	}
}

/* Picture in picture: the camera in the bottom-right corner over the slides (`cameraCorner`),
 * or the slides on the left and the camera beside them on the right. `cameraShare`: the camera's width. */
void ChurchMode::ApplyLayout(Feed feed, bool cameraCorner, float cameraShare)
{
	OBSSource source = Scene(feed);
	obs_scene_t *scene = obs_scene_from_source(source);
	if (!scene) {
		return;
	}
	float cx, cy;
	Canvas(cx, cy);
	OBSSceneItem content = FindRole(scene, "content");
	OBSSceneItem cam = FindRole(scene, "camera");

	if (cameraCorner) {
		float w = cx * cameraShare;
		float h = w * cy / cx;
		float margin = cy * 0.04f;
		if (content) {
			PlaceItem(content, 0.0f, 0.0f, cx, cy);
		}
		if (cam) {
			PlaceItem(cam, cx - w - margin, cy - h - margin, w, h);
		}
	} else {
		float margin = cx * 0.02f;
		float camW = cx * cameraShare;
		float camH = camW * cy / cx;
		float slidesW = cx - camW - margin * 3.0f;
		float slidesH = slidesW * cy / cx;
		if (content) {
			PlaceItem(content, margin, (cy - slidesH) / 2.0f, slidesW, slidesH);
		}
		if (cam) {
			PlaceItem(cam, margin * 2.0f + slidesW, (cy - camH) / 2.0f, camW, camH);
		}
	}
	if (cam) {
		obs_sceneitem_set_order(cam, OBS_ORDER_MOVE_TOP);
	}

	config_set_string(App()->GetUserConfig(), CONFIG_SECTION,
			  (std::string(FEED_IDS[size_t(feed)]) + "Layout").c_str(), cameraCorner ? "corner" : "side");
}

/* The current scene, nested in a feed scene — replacing the one that was there, in the same place. */
void ChurchMode::PlaceContent(obs_scene_t *feedScene, obs_source_t *content, Feed feed)
{
	if (!feedScene || !content) {
		return;
	}
	OBSSceneItem existing = FindRole(feedScene, "content");
	if (existing && obs_sceneitem_get_source(existing) == content) {
		return;
	}

	obs_transform_info info = {};
	obs_sceneitem_crop crop = {};
	bool hadPlace = false;
	if (existing) {
		obs_sceneitem_get_info2(existing, &info);
		obs_sceneitem_get_crop(existing, &crop);
		hadPlace = true;
		obs_sceneitem_remove(existing);
	}

	obs_sceneitem_t *item = obs_scene_add(feedScene, content);
	if (!item) {
		return;
	}
	SetRole(item, "content");
	if (hadPlace) {
		obs_sceneitem_set_info2(item, &info);
		obs_sceneitem_set_crop(item, &crop);
	} else {
		float cx, cy;
		Canvas(cx, cy);
		PlaceItem(item, 0.0f, 0.0f, cx, cy);
	}
	obs_sceneitem_set_order(item, OBS_ORDER_MOVE_BOTTOM);

	if (!hadPlace && feed == Feed::Side) {
		ApplyLayout(Feed::Side, false, 0.30f);
	}
}

void ChurchMode::SetContent(obs_source_t *scene)
{
	if (!scene || IsFeedScene(scene)) {
		return;
	}
	contentScene = OBSGetWeakRef(scene);
	for (Feed feed : {Feed::Main, Feed::Pip, Feed::Side}) {
		PlaceContent(obs_scene_from_source(Scene(feed)), scene, feed);
	}
	RefreshDeck();
}

bool ChurchMode::AutoSwitch() const
{
	config_t *config = App()->GetUserConfig();
	return !config_has_user_value(config, CONFIG_SECTION, "AutoSwitch") ||
	       config_get_bool(config, CONFIG_SECTION, "AutoSwitch");
}

/* A new slide: Main goes on air, and after two minutes without another, Camera only. */
void ChurchMode::SlideChanged()
{
	if (!AutoSwitch() || !autoCameraTimer) {
		return;
	}
	GoLive(Feed::Main);
	config_t *config = App()->GetUserConfig();
	int seconds = (int)config_get_int(config, CONFIG_SECTION, "AutoCameraSeconds");
	autoCameraTimer->start((seconds > 0 ? seconds : 120) * 1000);
}

/* Under Scene Transitions: previous / next slide, for a mouse (the keys and a presenter remote do the same). */
void ChurchMode::BuildSlideButtons()
{
	auto chevron = [](bool left, const QColor &color) {
		QString svg = QString("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'>"
				      "<circle cx='12' cy='12' r='10.5' fill='none' stroke='%2' stroke-opacity='0.45' stroke-width='1.4'/>"
				      "<path d='%1' fill='none' stroke='%2' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'/></svg>")
				      .arg(left ? "M13.8 7.5L9.3 12l4.5 4.5" : "M10.2 7.5l4.5 4.5-4.5 4.5", color.name());
		QSvgRenderer renderer(svg.toUtf8());
		QPixmap pixmap(64, 64);
		pixmap.fill(Qt::transparent);
		QPainter painter(&pixmap);
		painter.setRenderHint(QPainter::Antialiasing);
		renderer.render(&painter);
		return QIcon(pixmap);
	};

	QWidget *row = new QWidget();
	row->setObjectName("churchSlideButtons");
	QHBoxLayout *layout = new QHBoxLayout(row);
	layout->setContentsMargins(0, 4, 0, 0);
	layout->setSpacing(4);
	QColor color = row->palette().color(QPalette::ButtonText);

	QPushButton *prev = new QPushButton(chevron(true, color), QTStr("Church.Slide.Previous"));
	QPushButton *next = new QPushButton(QTStr("Church.Slide.Next"));
	next->setIcon(chevron(false, color));
	next->setLayoutDirection(Qt::RightToLeft); /* the arrow after the word */
	for (QPushButton *button : {prev, next}) {
		button->setIconSize(QSize(18, 18));
		button->setSizePolicy(QSizePolicy::Expanding, QSizePolicy::Preferred);
	}
	prev->setToolTip(QTStr("Church.Slide.PreviousTip"));
	next->setToolTip(QTStr("Church.Slide.NextTip"));
	connect(prev, &QPushButton::clicked, this, [this]() { SendToPanel({{"type", "nav"}, {"delta", -1}}); });
	connect(next, &QPushButton::clicked, this, [this]() { SendToPanel({{"type", "nav"}, {"delta", 1}}); });
	layout->addWidget(prev);
	layout->addWidget(next);

	if (QBoxLayout *dockLayout = qobject_cast<QBoxLayout *>(main->ui->transitionsDock->widget()->layout())) {
		dockLayout->addWidget(row);
	}
}

void ChurchMode::EnsureLiveGroups()
{
	if (ensuringGroups) {
		return;
	}
	ensuringGroups = true;
	float cx, cy;
	Canvas(cx, cy);
	for (OBSSource &scene : ContentScenes()) {
		/* Once per scene: if it is deleted on purpose, it stays deleted. */
		OBSDataAutoRelease priv = obs_source_get_private_settings(scene);
		if (obs_data_get_bool(priv, "church_live_added")) {
			continue;
		}
		obs_data_set_bool(priv, "church_live_added", true);
		OBSSource cam = EnsureCamera();
		obs_scene_t *s = obs_scene_from_source(scene);
		if (!cam || !s) {
			continue;
		}

		obs_sceneitem_t *group = obs_scene_add_group2(s, UniqueName(QTStr("Church.LiveVideo")).c_str(), true);
		if (!group) {
			continue;
		}
		SetRole(group, "live");
		obs_sceneitem_t *camItem = obs_scene_add(s, cam);
		if (camItem) {
			PlaceItem(camItem, 0.0f, 0.0f, cx, cy);
			obs_sceneitem_group_add_item(group, camItem);
		}
		obs_sceneitem_set_order(group, OBS_ORDER_MOVE_TOP);

		/* Opacity (Color Correction): 0% — the slides show; raise it to blend the video over them. */
		OBSDataAutoRelease filterSettings = obs_data_create();
		obs_data_set_double(filterSettings, "opacity", 0.0);
		OBSSourceAutoRelease filter =
			obs_source_create_private("color_filter_v2", QT_TO_UTF8(QTStr("Church.Opacity")), filterSettings);
		if (filter) {
			obs_source_filter_add(obs_sceneitem_get_source(group), filter);
		}
	}
	ensuringGroups = false;
	main->SaveProject();
}

/* "slide": the video as the opacity filter says; "clear": the video in full (the slide is gone);
 * "black": no video (the black slide shows). */
void ChurchMode::SetLiveVideo(const QString &mode)
{
	obs_scene_t *scene = obs_scene_from_source(CurrentContent());
	if (!scene) {
		return;
	}
	OBSSceneItem group = FindRole(scene, "live");
	if (!group) {
		return;
	}
	obs_sceneitem_set_visible(group, mode != "black");
	obs_source_t *groupSource = obs_sceneitem_get_source(group);
	struct Find {
		OBSSource filter;
	} find;
	obs_source_enum_filters(
		groupSource,
		[](obs_source_t *, obs_source_t *filter, void *param) {
			if (strcmp(obs_source_get_unversioned_id(filter), "color_filter") == 0 && !static_cast<Find *>(param)->filter) {
				static_cast<Find *>(param)->filter = filter;
			}
		},
		&find);
	if (find.filter) {
		obs_source_set_enabled(find.filter, mode != "clear");
	}
}

QString ChurchMode::StreamTitle() const
{
	/* The pulpit / sermon item: by its name or its scene's name. */
	static const char *keys[] = {"講台", "讲台", "pulpit", "sermon", "信息", "講道", "讲道", "message"};
	auto matches = [](const QString &text) {
		for (const char *key : keys) {
			if (text.contains(QString::fromUtf8(key), Qt::CaseInsensitive)) {
				return true;
			}
		}
		return false;
	};
	auto titleOf = [](const QJsonObject &item) {
		QString title = item.value("title").toString().trimmed();
		return title.isEmpty() ? item.value("name").toString().trimmed() : title;
	};

	QString title;
	for (OBSSource &scene : ContentScenes()) {
		std::vector<OBSSource> items;
		CollectItems(obs_scene_from_source(scene), items);
		bool sceneMatches = matches(QT_UTF8(obs_source_get_name(scene)));
		for (OBSSource &item : items) {
			QJsonObject json = ItemJson(item);
			if (json.value("kind").toString() != "text") {
				continue;
			}
			if (sceneMatches || matches(json.value("name").toString())) {
				title = titleOf(json);
				break;
			}
		}
		if (!title.isEmpty()) {
			break;
		}
	}
	if (title.isEmpty()) {
		/* Otherwise: what is on screen now. */
		OBSSourceAutoRelease live = obs_get_source_by_uuid(ChurchSlides::Live().c_str());
		if (live && ChurchSlides::Is(live)) {
			title = titleOf(ItemJson(live));
		}
	}
	QString date = QDate::currentDate().toString("yyyy-MM-dd");
	return title.isEmpty() ? date + " Live" : date + " Live - " + title;
}

void ChurchMode::HideFeedScenes()
{
	for (int i = 0; i < main->ui->scenes->count(); i++) {
		QListWidgetItem *row = main->ui->scenes->item(i);
		OBSScene scene = GetOBSRef<OBSScene>(row);
		row->setHidden(IsFeedScene(obs_scene_get_source(scene)));
	}
}

/* ---------------------------- layout ------------------------------------ */

void ChurchMode::BuildLayout()
{
	Ui::OBSBasic *ui = main->ui.get();

	ui->verticalLayout->removeWidget(ui->canvasEditor);
	ui->verticalLayout->removeWidget(ui->contextContainer);

	/* ① The preview exactly as OBS has it (with its context bar under it). */
	QWidget *previewBox = new QWidget();
	QVBoxLayout *previewLayout = new QVBoxLayout(previewBox);
	previewLayout->setContentsMargins(0, 0, 0, 0);
	previewLayout->setSpacing(0);
	previewLayout->addWidget(ui->canvasEditor, 1);
	previewLayout->addWidget(ui->contextContainer);
	previewScreen = new ChurchScreen(QTStr("Church.Screen.Main"), previewBox);

	QMenu *previewMenu = new QMenu(previewScreen);
	connect(previewMenu, &QMenu::aboutToShow, this, [this, previewMenu]() { FillPreviewProjectMenu(previewMenu); });
	previewScreen->ProjectButton()->setMenu(previewMenu);

	QSplitter *column = new QSplitter(Qt::Vertical);
	column->setChildrenCollapsible(false);
	column->addWidget(previewScreen);

	auto addColumnScreen = [&](Feed feed, const char *title, QPointer<ChurchSceneDisplay> &view,
				   QPointer<ChurchScreen> &screen) {
		view = new ChurchSceneDisplay();
		screen = new ChurchScreen(QTStr(title), view);
		view->setToolTip(QTStr("Church.Screen.Tip"));
		view->setContextMenuPolicy(Qt::CustomContextMenu);
		ChurchSceneDisplay *v = view;
		connect(view.data(), &QWidget::customContextMenuRequested, this, [this, feed, v]() { ShowFeedMenu(feed, v); });
		connect(view.data(), &ChurchSceneDisplay::layoutChanged, main, &OBSBasic::SaveProject);
		QMenu *projectMenu = new QMenu(screen);
		connect(projectMenu, &QMenu::aboutToShow, this, [this, projectMenu, feed]() {
			projectMenu->clear();
			FillProjectMenu(projectMenu, feed);
		});
		screen->ProjectButton()->setMenu(projectMenu);
		column->addWidget(screen);
	};
	addColumnScreen(Feed::Camera, "Church.Screen.Camera", columnCamera, columnCameraScreen);
	addColumnScreen(Feed::Pip, "Church.Screen.Pip", columnPip, columnPipScreen);
	column->setStretchFactor(0, 4);
	column->setStretchFactor(1, 3);
	column->setStretchFactor(2, 3);

	/* The slide area. */
	QWidget *left = nullptr;
	const std::string panelFile = PresenterFile("panel.html");
	if (cef && !panelFile.empty()) {
		int fontScale = (int)config_get_int(App()->GetUserConfig(), "Appearance", "FontScale");
		std::string url = AbsoluteUrl(panelFile) + "?lang=" + App()->GetLocale() +
				  "&font=" + std::to_string(fontScale > 0 ? fontScale : 10);
		panel = cef->create_widget(nullptr, url, nullptr);
	}
	if (panel) {
		panel->setMinimumWidth(320);
		connect(panel.data(), &QCefWidget::hostMessage, this, &ChurchMode::PanelMessage);
		left = panel;
	} else {
		QLabel *missing = new QLabel(QTStr("Church.PanelMissing"));
		missing->setAlignment(Qt::AlignCenter);
		left = missing;
	}

	splitter = new QSplitter(Qt::Horizontal);
	splitter->setObjectName("churchSplitter");
	splitter->setChildrenCollapsible(false);
	splitter->addWidget(left);
	splitter->addWidget(column);
	splitter->setStretchFactor(0, 7);
	splitter->setStretchFactor(1, 3);
	ui->verticalLayout->addWidget(splitter, 1);

	config_t *config = App()->GetUserConfig();
	const char *state = config_get_string(config, CONFIG_SECTION, "SplitterState");
	const char *columnState = config_get_string(config, CONFIG_SECTION, "ColumnState");
	if (state && *state) {
		splitter->restoreState(QByteArray::fromBase64(state));
	} else {
		/* About 70% slides, 30% screens. */
		QTimer::singleShot(0, splitter, [this]() {
			int w = splitter->width();
			splitter->setSizes({w * 70 / 100, w * 30 / 100});
		});
	}
	if (columnState && *columnState) {
		column->restoreState(QByteArray::fromBase64(columnState));
	}
	connect(splitter, &QSplitter::splitterMoved, this, [this]() {
		config_set_string(App()->GetUserConfig(), CONFIG_SECTION, "SplitterState",
				  splitter->saveState().toBase64().constData());
	});
	connect(column, &QSplitter::splitterMoved, this, [column]() {
		config_set_string(App()->GetUserConfig(), CONFIG_SECTION, "ColumnState",
				  column->saveState().toBase64().constData());
	});
}

void ChurchMode::BuildOutputDock()
{
	QFrame *frame = new QFrame();
	frame->setObjectName("churchOutput");
	/* Room for the screens and the mixer's slider, meter and mute button. */
	frame->setMinimumHeight(240);
	QHBoxLayout *layout = new QHBoxLayout(frame);
	layout->setContentsMargins(6, 6, 6, 6);
	layout->setSpacing(8);

	/* Which picture goes out: click one. These are for choosing only — no projecting from here. */
	Tiles *tiles = new Tiles();
	for (size_t i = 0; i < FEEDS; i++) {
		Feed feed = Feed(i);
		ChurchSceneDisplay *view = new ChurchSceneDisplay();
		view->setMinimumSize(96, 54);
		view->setToolTip(QTStr("Church.Picker.Tip"));
		ChurchScreen *screen = new ChurchScreen(QTStr(FEED_NAMES[i]), view, nullptr, true);
		screen->ProjectButton()->hide();
		connect(view, &ChurchSceneDisplay::clicked, this, [this, feed, view]() {
			if (!view->IsEditing()) {
				GoLive(feed, true);
			}
		});
		view->setContextMenuPolicy(Qt::CustomContextMenu);
		connect(view, &QWidget::customContextMenuRequested, this, [this, feed, view]() { ShowFeedMenu(feed, view); });
		connect(view, &ChurchSceneDisplay::layoutChanged, main, &OBSBasic::SaveProject);

		pickerViews[i] = view;
		pickerScreens[i] = screen;
		tiles->Add(screen);
	}
	layout->addWidget(tiles, 3);
	layout->addWidget(BuildOutputMixer(), 2);

	outputDock = new OBSDock(main);
	outputDock->setObjectName(QStringLiteral("churchOutputDock"));
	/* "&" would be taken for a keyboard shortcut mark. */
	outputDock->setWindowTitle(QTStr("Church.Dock.Output").replace("&", "&&"));
	outputDock->setWidget(frame);
	outputDock->setFeatures(QDockWidget::DockWidgetClosable | QDockWidget::DockWidgetMovable |
				QDockWidget::DockWidgetFloatable);
	main->addDockWidget(Qt::BottomDockWidgetArea, outputDock);
	main->splitDockWidget(main->controlsDock, outputDock, Qt::Horizontal);

	/* View ▸ Docks lists it with the others. */
	main->ui->menuDocks->insertAction(main->controlsDock->toggleViewAction(), outputDock->toggleViewAction());
}

/* Under the Sources list: add slide items to the current scene, and the default style. */
void ChurchMode::BuildSourceButtons()
{
	QWidget *bar = new QWidget();
	bar->setObjectName("churchSourceButtons");
	QGridLayout *grid = new QGridLayout(bar);
	grid->setContentsMargins(4, 4, 4, 4);
	grid->setSpacing(4);

	struct Button {
		const char *kind;
		const char *text;
	};
	const Button buttons[] = {{"text", "Church.Add.Text"},   {"scripture", "Church.Add.Scripture"},
				  {"image", "Church.Add.Image"}, {"video", "Church.Add.Video"},
				  {"ppt", "Church.Add.Ppt"},     {nullptr, "Church.Add.Style"}};
	int i = 0;
	for (const Button &b : buttons) {
		QPushButton *button = new QPushButton(QTStr(b.text));
		button->setToolTip(QTStr((std::string(b.text) + ".Tip").c_str()));
		QString kind = b.kind ? QString::fromUtf8(b.kind) : QString();
		connect(button, &QPushButton::clicked, this, [this, kind]() {
			if (kind.isEmpty()) {
				SendToPanel({{"type", "edit-look"}, {"id", QJsonValue::Null}});
			} else {
				SendToPanel({{"type", "add"}, {"kind", kind}});
			}
			if (panel) {
				panel->setFocus();
			}
		});
		grid->addWidget(button, i / 3, i % 3);
		i++;
	}
	/* Above OBS's own controls (add, remove, properties, up, down). */
	QWidget *toolbar = main->ui->sourcesToolbar;
	QBoxLayout *layout = toolbar && toolbar->parentWidget()
				     ? qobject_cast<QBoxLayout *>(toolbar->parentWidget()->layout())
				     : nullptr;
	if (layout && layout->indexOf(toolbar) >= 0) {
		layout->insertWidget(layout->indexOf(toolbar), bar);
	} else {
		main->ui->verticalLayout_5->addWidget(bar);
	}
}

void ChurchMode::ResetDocks()
{
	if (!outputDock) {
		return;
	}
	outputDock->setVisible(true);
	outputDock->setFloating(false);
	main->splitDockWidget(main->controlsDock, outputDock, Qt::Horizontal);
	int cx = main->width();
	main->resizeDocks({main->ui->mixerDock, main->ui->transitionsDock, main->controlsDock, outputDock.data()},
			  {cx * 28 / 100, cx * 12 / 100, cx * 14 / 100, cx * 36 / 100}, Qt::Horizontal);
}

void ChurchMode::BindViews()
{
	for (size_t i = 0; i < FEEDS; i++) {
		if (pickerViews[i]) {
			pickerViews[i]->SetSource(Scene(Feed(i)));
		}
	}
	if (columnCamera) {
		columnCamera->SetSource(Scene(Feed::Camera));
	}
	if (columnPip) {
		columnPip->SetSource(Scene(Feed::Pip));
	}
}

void ChurchMode::UpdateLive()
{
	OBSSource program = main->IsPreviewProgramMode() ? main->GetProgramSource() : main->GetCurrentSceneSource();
	for (size_t i = 0; i < FEEDS; i++) {
		bool live = program && program == Scene(Feed(i));
		if (pickerScreens[i]) {
			pickerScreens[i]->SetLive(live);
		}
	}
	if (previewScreen) {
		OBSSource preview = main->GetCurrentSceneSource();
		QString name = preview ? QT_UTF8(obs_source_get_name(preview)) : QString();
		previewScreen->SetTitle(QTStr("Church.Screen.MainNamed").arg(name));
	}
}

void ChurchMode::GoLive(Feed feed, bool byHand)
{
	OBSSource scene = Scene(feed);
	if (!scene) {
		return;
	}
	if (byHand && autoCameraTimer) {
		autoCameraTimer->stop();
	}
	if (main->GetProgramSource() == scene) {
		return;
	}
	if (!main->IsPreviewProgramMode()) {
		main->SetPreviewProgramMode(true);
	}
	main->TransitionToScene(scene);
	UpdateLive();
}

void ChurchMode::ShowFeedMenu(Feed feed, ChurchSceneDisplay *view)
{
	QMenu menu;
	menu.addAction(QTStr("Church.Menu.GoLive"), this, [this, feed]() { GoLive(feed, true); });
	QAction *autoAction = menu.addAction(QTStr("Church.Menu.AutoSwitch"));
	autoAction->setCheckable(true);
	autoAction->setChecked(AutoSwitch());
	connect(autoAction, &QAction::toggled, this, [this](bool on) {
		config_set_bool(App()->GetUserConfig(), CONFIG_SECTION, "AutoSwitch", on);
		if (!on && autoCameraTimer) {
			autoCameraTimer->stop();
		}
	});

	if (feed == Feed::Pip || feed == Feed::Side) {
		menu.addSeparator();
		QAction *edit = menu.addAction(QTStr("Church.Menu.EditLayout"));
		edit->setCheckable(true);
		edit->setChecked(view->IsEditing());
		connect(edit, &QAction::toggled, this, [this, view, feed](bool on) {
			view->SetEditing(on);
			for (size_t i = 0; i < FEEDS; i++) {
				if (pickerViews[i] == view) {
					pickerScreens[i]->SetNote(on ? QTStr("Church.Menu.Editing") : QString());
				}
			}
			if (columnPip == view) {
				columnPipScreen->SetNote(on ? QTStr("Church.Menu.Editing") : QString());
			}
			if (!on) {
				main->SaveProject();
			}
			UNUSED_PARAMETER(feed);
		});

		const char *layoutKey = feed == Feed::Pip ? "pipLayout" : "sideLayout";
		const char *current = config_get_string(App()->GetUserConfig(), CONFIG_SECTION, layoutKey);
		bool corner = current ? strcmp(current, "corner") == 0 : feed == Feed::Pip;

		QMenu *layout = menu.addMenu(QTStr("Church.Menu.Layout"));
		QAction *cornerAction = layout->addAction(QTStr("Church.Menu.LayoutCorner"), this, [this, feed]() {
			ApplyLayout(feed, true, 0.32f);
			main->SaveProject();
		});
		QAction *sideAction = layout->addAction(QTStr("Church.Menu.LayoutSide"), this, [this, feed]() {
			ApplyLayout(feed, false, 0.30f);
			main->SaveProject();
		});
		cornerAction->setCheckable(true);
		sideAction->setCheckable(true);
		cornerAction->setChecked(corner);
		sideAction->setChecked(!corner);

		QMenu *size = menu.addMenu(QTStr("Church.Menu.CameraSize"));
		for (int percent : {20, 25, 33, 40, 50}) {
			size->addAction(QString("%1%").arg(percent), this, [this, feed, corner, percent]() {
				ApplyLayout(feed, corner, float(percent) / 100.0f);
				main->SaveProject();
			});
		}
	}

	OBSSource cam = OBSGetStrongRef(camera);
	if ((feed == Feed::Camera || feed == Feed::Pip || feed == Feed::Side) && cam) {
		menu.addSeparator();
		menu.addAction(QTStr("Church.Menu.CameraProperties"), this,
			       [this, cam]() { main->CreatePropertiesWindow(cam); });
		menu.addAction(QTStr("Church.Menu.CameraFilters"), this, [this, cam]() { main->CreateFiltersWindow(cam); });
	}

	/* Projecting is for the screens on the right, not the small pickers. */
	bool isPicker = std::find(pickerViews.begin(), pickerViews.end(), view) != pickerViews.end();
	if (!isPicker) {
		menu.addSeparator();
		FillProjectMenu(&menu, feed);
	}
	menu.exec(QCursor::pos());
}

void ChurchMode::FillProjectMenu(QMenu *menu, Feed feed)
{
	QMenu *sub = menu->addMenu(QTStr("Church.Project.Screen"));
	QList<QString> monitors = OBSBasic::GetProjectorMenuMonitorsFormatted();
	for (int i = 0; i < monitors.size(); i++) {
		sub->addAction(monitors[i], this, [this, feed, i]() {
			OBSSource scene = Scene(feed);
			if (scene) {
				main->OpenProjector(scene, i, ProjectorType::Scene);
			}
		});
	}
	menu->addAction(QTStr("Church.Project.Window"), this, [this, feed]() {
		OBSSource scene = Scene(feed);
		if (scene) {
			main->OpenProjector(scene, -1, ProjectorType::Scene);
		}
	});
	menu->addSeparator();
	QMenu *program = menu->addMenu(QTStr("Church.Project.Program"));
	for (int i = 0; i < monitors.size(); i++) {
		program->addAction(monitors[i], this,
				   [this, i]() { main->OpenProjector(nullptr, i, ProjectorType::StudioProgram); });
	}
	program->addAction(QTStr("Church.Project.Window"), this,
			   [this]() { main->OpenProjector(nullptr, -1, ProjectorType::StudioProgram); });
}

void ChurchMode::FillPreviewProjectMenu(QMenu *menu)
{
	menu->clear();
	QMenu *sub = menu->addMenu(QTStr("Church.Project.Screen"));
	QList<QString> monitors = OBSBasic::GetProjectorMenuMonitorsFormatted();
	for (int i = 0; i < monitors.size(); i++) {
		sub->addAction(monitors[i], this, [this, i]() { main->OpenProjector(nullptr, i, ProjectorType::Preview); });
	}
	menu->addAction(QTStr("Church.Project.Window"), this,
			[this]() { main->OpenProjector(nullptr, -1, ProjectorType::Preview); });
}

/* ---------------------------- audio mixer ------------------------------- */

QWidget *ChurchMode::BuildOutputMixer()
{
	mixerContainer = new QWidget();
	mixerLayout = new QHBoxLayout(mixerContainer);
	mixerLayout->setContentsMargins(0, 0, 0, 0);
	mixerLayout->setSpacing(0);
	mixerLayout->addStretch(1);

	QScrollArea *scroll = new QScrollArea();
	scroll->setObjectName("churchOutputMixer");
	scroll->setToolTip(QTStr("Church.Mixer.Tip"));
	scroll->setWidgetResizable(true);
	scroll->setFrameShape(QFrame::NoFrame);
	scroll->setHorizontalScrollBarPolicy(Qt::ScrollBarAsNeeded);
	scroll->setVerticalScrollBarPolicy(Qt::ScrollBarAlwaysOff);
	scroll->setWidget(mixerContainer);

	mixerRefreshTimer = new QTimer(scroll);
	mixerRefreshTimer->setSingleShot(true);
	mixerRefreshTimer->setInterval(50);
	connect(mixerRefreshTimer.data(), &QTimer::timeout, this, &ChurchMode::RefreshMixer);

	/* Sources come and go with scenes and collections: follow them like the main mixer does. */
	signal_handler_t *sh = obs_get_signal_handler();
	for (const char *signal : {"source_create", "source_remove", "source_destroy", "source_audio_activate",
				   "source_audio_deactivate", "channel_change"}) {
		mixerSignals.emplace_back(sh, signal, ChurchMode::MixerSourcesChanged, this);
	}

	QueueMixerRefresh();
	return scroll;
}

void ChurchMode::MixerSourcesChanged(void *data, calldata_t *)
{
	QMetaObject::invokeMethod(static_cast<ChurchMode *>(data), "QueueMixerRefresh", Qt::QueuedConnection);
}

void ChurchMode::QueueMixerRefresh()
{
	if (mixerRefreshTimer) {
		mixerRefreshTimer->start();
	}
}

void ChurchMode::RefreshMixer()
{
	if (!mixerLayout) {
		return;
	}

	/* The slides' sound first, then desktop audio and microphones (the global channels),
	 * then media and the rest by name — every source with sound, as the main mixer lists them. */
	std::vector<OBSSource> sources;
	std::vector<std::string> seen;
	if (output) {
		sources.emplace_back(output);
		seen.emplace_back(obs_source_get_uuid(output));
	}
	for (int channel = 1; channel <= 6; channel++) {
		OBSSourceAutoRelease source = obs_get_output_source(channel);
		if (source && (obs_source_get_output_flags(source) & OBS_SOURCE_AUDIO) != 0) {
			sources.emplace_back(source.Get());
			seen.emplace_back(obs_source_get_uuid(source));
		}
	}
	std::vector<OBSSource> others;
	auto collect = [](void *param, obs_source_t *source) -> bool {
		auto *list = static_cast<std::vector<OBSSource> *>(param);
		if ((obs_source_get_output_flags(source) & OBS_SOURCE_AUDIO) != 0 && obs_source_audio_active(source) &&
		    !ChurchSlides::Is(source)) {
			list->emplace_back(source);
		}
		return true;
	};
	obs_enum_sources(collect, &others);
	std::sort(others.begin(), others.end(), [](const OBSSource &a, const OBSSource &b) {
		return QString::localeAwareCompare(QT_UTF8(obs_source_get_name(a)), QT_UTF8(obs_source_get_name(b))) < 0;
	});
	for (OBSSource &source : others) {
		const char *uuid = obs_source_get_uuid(source);
		if (std::find(seen.begin(), seen.end(), uuid) == seen.end()) {
			sources.emplace_back(source);
			seen.emplace_back(uuid);
		}
	}

	for (auto it = mixerControls.begin(); it != mixerControls.end();) {
		if (!it->second || std::find(seen.begin(), seen.end(), it->first) == seen.end()) {
			if (it->second) {
				it->second->deleteLater();
			}
			it = mixerControls.erase(it);
		} else {
			++it;
		}
	}

	double decayRate = config_get_double(main->Config(), "Audio", "MeterDecayRate");
	enum obs_peak_meter_type peakType = config_get_uint(main->Config(), "Audio", "PeakMeterType") == 1
						    ? TRUE_PEAK_METER
						    : SAMPLE_PEAK_METER;

	int index = 0;
	for (OBSSource &source : sources) {
		const std::string uuid = obs_source_get_uuid(source);
		QPointer<VolumeControl> &control = mixerControls[uuid];
		if (!control) {
			control = new VolumeControl(source, mixerContainer, true, true);
			control->setMeterDecayRate(decayRate);
			control->setPeakMeterType(peakType);
		}
		mixerLayout->removeWidget(control);
		mixerLayout->insertWidget(index++, control);
	}
}

/* ---------------------------- slide items ------------------------------- */

QJsonObject ChurchMode::BuildDeck() const
{
	QJsonArray sceneList;
	std::set<std::string> seen;
	for (OBSSource &scene : ContentScenes()) {
		std::vector<OBSSource> items;
		CollectItems(obs_scene_from_source(scene), items);
		QJsonArray itemList;
		for (OBSSource &item : items) {
			if (seen.insert(obs_source_get_uuid(item)).second) {
				itemList.append(ItemJson(item));
			}
		}
		sceneList.append(QJsonObject{{"id", QT_UTF8(obs_source_get_uuid(scene))},
					     {"name", QT_UTF8(obs_source_get_name(scene))},
					     {"items", itemList}});
	}

	const char *look = config_get_string(App()->GetUserConfig(), CONFIG_SECTION, "DefaultLook");
	QJsonObject defaultLook = look ? QJsonDocument::fromJson(look).object() : QJsonObject();
	if (defaultLook.isEmpty()) {
		defaultLook = {{"themeId", "navy"}, {"layout", "center"}};
	}

	OBSSource current = CurrentContent();
	return {{"scenes", sceneList},
		{"defaultLook", defaultLook},
		{"currentScene", current ? QJsonValue(QT_UTF8(obs_source_get_uuid(current))) : QJsonValue::Null}};
}

void ChurchMode::RefreshDeck()
{
	if (!panel) {
		return;
	}
	QJsonObject deck = BuildDeck();
	QString text = QString::fromUtf8(QJsonDocument(deck).toJson(QJsonDocument::Compact));
	if (text == lastDeck) {
		return;
	}
	/* What the account syncs: everything but which scene is on screen. */
	QJsonObject content = deck;
	content.remove("currentScene");
	QJsonObject old = QJsonDocument::fromJson(lastDeck.toUtf8()).object();
	old.remove("currentScene");
	if (old != content) {
		contentRevision++;
	}
	lastDeck = text;
	SendToPanel({{"type", "deck"}, {"deck", deck}});
}

OBSSource ChurchMode::CreateItem(const QJsonObject &item, obs_scene_t *scene)
{
	QJsonObject stored = item;
	stored.remove("id");
	QString name = stored.value("name").toString();
	stored.remove("name");

	OBSDataAutoRelease settings = obs_data_create();
	obs_data_set_string(settings, CHURCH_SLIDES_ITEM,
			    QJsonDocument(stored).toJson(QJsonDocument::Compact).constData());
	OBSSourceAutoRelease source =
		obs_source_create(CHURCH_SLIDES_ID, UniqueName(name).c_str(), settings, nullptr);
	if (!source) {
		return nullptr;
	}
	/* An id that stays the same on every computer the account syncs to. */
	if (!stored.contains("syncId")) {
		stored["syncId"] = QT_UTF8(obs_source_get_uuid(source));
		OBSDataAutoRelease update = obs_data_create();
		obs_data_set_string(update, CHURCH_SLIDES_ITEM,
				    QJsonDocument(stored).toJson(QJsonDocument::Compact).constData());
		obs_source_update(source, update);
	}
	if (scene) {
		obs_sceneitem_t *added = obs_scene_add(scene, source);
		PlaceAfterAnchor(scene, added);
	}
	return source.Get();
}

/* Below the item selected in Sources (or the one just added before it); otherwise at the end of the list. */
void ChurchMode::PlaceAfterAnchor(obs_scene_t *scene, obs_sceneitem_t *added)
{
	if (!added) {
		return;
	}
	OBSSceneItem anchor = insertAnchor;
	/* An item inside a group (the camera in Live Video): its group is the one in this scene. */
	if (anchor && obs_sceneitem_get_scene(anchor) != scene) {
		obs_scene_t *groupScene = obs_sceneitem_get_scene(anchor);
		anchor = obs_scene_get_group(scene, obs_source_get_name(obs_scene_get_source(groupScene)));
	}
	if (anchor && anchor != added && obs_sceneitem_get_scene(anchor) == scene) {
		struct Find {
			obs_sceneitem_t *target;
			int index = 0, found = -1;
		} find{anchor};
		obs_scene_enum_items(
			scene,
			[](obs_scene_t *, obs_sceneitem_t *item, void *param) {
				Find *f = static_cast<Find *>(param);
				if (item == f->target) {
					f->found = f->index;
				}
				f->index++;
				return true;
			},
			&find);
		if (find.found >= 0) {
			/* Just beneath the anchor in drawing order: just after it in the list. */
			obs_sceneitem_set_order_position(added, find.found);
		}
	} else {
		obs_sceneitem_set_order(added, OBS_ORDER_MOVE_BOTTOM);
	}
	insertAnchor = added;
}

void ChurchMode::SaveItems(const QJsonArray &items, const QString &sceneId)
{
	OBSSourceAutoRelease target =
		sceneId.isEmpty() ? nullptr : obs_get_source_by_uuid(QT_TO_UTF8(sceneId));
	obs_source_t *sceneSource = target.Get();
	if (!sceneSource || !obs_scene_from_source(sceneSource) || IsFeedScene(sceneSource)) {
		sceneSource = CurrentContent();
	}
	obs_scene_t *scene = obs_scene_from_source(sceneSource);
	/* Read the selection now: OBS selects each item as it is added. */
	insertAnchor = main->GetCurrentSceneItem();

	for (const QJsonValue &value : items) {
		QJsonObject item = value.toObject();
		const QString id = item.value("id").toString();
		OBSSourceAutoRelease existing = id.isEmpty() ? nullptr : obs_get_source_by_uuid(QT_TO_UTF8(id));
		if (existing && ChurchSlides::Is(existing)) {
			QJsonObject stored = item;
			stored.remove("id");
			QString name = stored.value("name").toString();
			stored.remove("name");
			/* Keep the sync id (the panel does not know it). */
			OBSDataAutoRelease old = obs_source_get_settings(existing);
			QJsonObject previous = QJsonDocument::fromJson(obs_data_get_string(old, CHURCH_SLIDES_ITEM)).object();
			if (previous.contains("syncId") && !stored.contains("syncId")) {
				stored["syncId"] = previous.value("syncId");
			}
			OBSDataAutoRelease update = obs_data_create();
			obs_data_set_string(update, CHURCH_SLIDES_ITEM,
					    QJsonDocument(stored).toJson(QJsonDocument::Compact).constData());
			obs_source_update(existing, update);
			if (!name.isEmpty() && name != QT_UTF8(obs_source_get_name(existing))) {
				obs_source_set_name(existing, UniqueName(name, existing).c_str());
			}
		} else if (scene) {
			CreateItem(item, scene);
		}
	}
	insertAnchor = nullptr;
	main->SaveProject();
	RefreshDeck();
}

void ChurchMode::EditItem(const std::string &uuid)
{
	SendToPanel({{"type", "edit-item"}, {"id", QString::fromStdString(uuid)}});
	if (panel) {
		panel->setFocus();
	}
}

/* Items from before they were sources (church-presenter/library.json): into the current scene, once. */
void ChurchMode::ImportOldLibrary()
{
	BPtr<char> path = GetAppConfigPathPtr("obs-studio/church-presenter/library.json");
	QFile file(QT_UTF8(path.Get()));
	if (!file.exists() || !file.open(QIODevice::ReadOnly)) {
		return;
	}
	QJsonObject library = QJsonDocument::fromJson(file.readAll()).object();
	file.close();

	obs_scene_t *scene = obs_scene_from_source(CurrentContent());
	if (!scene) {
		return;
	}
	for (const QJsonValue &value : library.value("items").toArray()) {
		QJsonObject item = value.toObject();
		item.remove("id");
		CreateItem(item, scene);
	}
	if (library.contains("defaultLook")) {
		config_set_string(App()->GetUserConfig(), CONFIG_SECTION, "DefaultLook",
				  QJsonDocument(library.value("defaultLook").toObject()).toJson(QJsonDocument::Compact).constData());
	}
	file.rename(QT_UTF8(path.Get()) + ".imported");
	main->SaveProjectNow();
}

QJsonObject ChurchMode::ExportContent() const
{
	QJsonObject deck = BuildDeck();
	QJsonArray scenesOut;
	for (const QJsonValue &value : deck.value("scenes").toArray()) {
		QJsonObject scene = value.toObject();
		QJsonArray items;
		for (const QJsonValue &itemValue : scene.value("items").toArray()) {
			QJsonObject item = itemValue.toObject();
			item.remove("id");
			items.append(item);
		}
		scenesOut.append(QJsonObject{{"name", scene.value("name")}, {"items", items}});
	}
	return {{"version", 1}, {"defaultLook", deck.value("defaultLook")}, {"scenes", scenesOut}};
}

void ChurchMode::ImportContent(const QJsonObject &content)
{
	if (content.contains("defaultLook")) {
		config_set_string(App()->GetUserConfig(), CONFIG_SECTION, "DefaultLook",
				  QJsonDocument(content.value("defaultLook").toObject()).toJson(QJsonDocument::Compact).constData());
	}

	for (const QJsonValue &sceneValue : content.value("scenes").toArray()) {
		QJsonObject remote = sceneValue.toObject();
		const QString name = remote.value("name").toString();

		/* The scene with this name, or a new one. */
		OBSSourceAutoRelease found = obs_get_source_by_name(QT_TO_UTF8(name));
		OBSSource sceneSource = found.Get();
		if (!sceneSource || !obs_scene_from_source(sceneSource) || IsFeedScene(sceneSource)) {
			OBSSceneAutoRelease created = obs_scene_create(UniqueName(name).c_str());
			sceneSource = obs_scene_get_source(created);
		}
		obs_scene_t *scene = obs_scene_from_source(sceneSource);

		/* Local items by sync id. */
		std::vector<OBSSource> local;
		CollectItems(scene, local);
		std::map<QString, OBSSource> bySync;
		for (OBSSource &item : local) {
			QString syncId = ItemJson(item).value("syncId").toString();
			if (!syncId.isEmpty()) {
				bySync[syncId] = item;
			}
		}

		std::set<QString> wanted;
		std::vector<OBSSource> order;
		for (const QJsonValue &itemValue : remote.value("items").toArray()) {
			QJsonObject item = itemValue.toObject();
			QString syncId = item.value("syncId").toString();
			wanted.insert(syncId);
			auto it = bySync.find(syncId);
			if (it != bySync.end()) {
				QJsonObject update = item;
				update["id"] = QT_UTF8(obs_source_get_uuid(it->second));
				SaveItems(QJsonArray{update}, QString());
				order.push_back(it->second);
			} else {
				OBSSource created = CreateItem(item, scene);
				if (created) {
					order.push_back(created);
				}
			}
		}
		/* Items deleted on the other computer. */
		for (OBSSource &item : local) {
			QString syncId = ItemJson(item).value("syncId").toString();
			if (!syncId.isEmpty() && !wanted.count(syncId)) {
				obs_source_remove(item);
			}
		}
		/* The same order as there: top of the list first. */
		std::vector<OBSSource> now;
		CollectItems(scene, now);
		std::vector<std::string> nowIds, wantIds;
		for (OBSSource &s : now) {
			nowIds.emplace_back(obs_source_get_uuid(s));
		}
		for (OBSSource &s : order) {
			wantIds.emplace_back(obs_source_get_uuid(s));
		}
		if (nowIds != wantIds) {
			for (auto it = order.rbegin(); it != order.rend(); ++it) {
				obs_sceneitem_t *item = obs_scene_find_source(scene, obs_source_get_name(*it));
				if (item) {
					obs_sceneitem_set_order(item, OBS_ORDER_MOVE_TOP);
				}
			}
		}
	}
	main->SaveProject();
	RefreshDeck();
}

/* ---------------------------- messages ---------------------------------- */

void ChurchMode::SendToPanel(const QJsonObject &message)
{
	if (!panel) {
		return;
	}
	QString json = QString::fromUtf8(QJsonDocument(message).toJson(QJsonDocument::Compact));
	panel->executeJavaScript(("window.churchHost && window.churchHost.receive(" + json + ");").toStdString());
}

void ChurchMode::SendToOutput(const QString &specJson)
{
	if (!output) {
		return;
	}
	const std::string json = specJson.toStdString();
	calldata_t cd = {};
	calldata_set_string(&cd, "eventName", "church-show");
	calldata_set_string(&cd, "jsonString", json.c_str());
	proc_handler_call(obs_source_get_proc_handler(output), "javascript_event", &cd);
	calldata_free(&cd);
}

void ChurchMode::PanelMessage(const QString &json)
{
	const QJsonObject message = QJsonDocument::fromJson(json.toUtf8()).object();
	const QString type = message.value("type").toString();

	if (type == "focus") {
		panelFocused = message.value("focused").toBool();

	} else if (type == "panel-ready") {
		lastDeck.clear();
		RefreshDeck();

	} else if (type == "save-items") {
		SaveItems(message.value("items").toArray(), message.value("sceneId").toString());

	} else if (type == "remove-item") {
		OBSSourceAutoRelease source = obs_get_source_by_uuid(QT_TO_UTF8(message.value("id").toString()));
		if (source && ChurchSlides::Is(source)) {
			obs_source_remove(source);
			main->SaveProject();
		}
		RefreshDeck();

	} else if (type == "set-default-look") {
		config_set_string(App()->GetUserConfig(), CONFIG_SECTION, "DefaultLook",
				  QJsonDocument(message.value("look").toObject()).toJson(QJsonDocument::Compact).constData());
		RefreshDeck();

	} else if (type == "show") {
		const QString previousShow = lastShow;
		lastShow = QString::fromUtf8(QJsonDocument(message.value("spec").toObject()).toJson(QJsonDocument::Compact));
		const QJsonObject ref = message.value("ref").toObject();
		if (!ref.isEmpty()) {
			if (ChurchSlides::Live() != ref.value("itemId").toString().toStdString() ||
			    lastShow != previousShow) {
				SlideChanged();
			}
			ChurchSlides::SetLive(ref.value("itemId").toString().toStdString());
			/* The slides moved on to another scene: the main screen (and every feed) follows. */
			OBSSourceAutoRelease scene = obs_get_source_by_uuid(QT_TO_UTF8(ref.value("sceneId").toString()));
			if (scene && obs_scene_from_source(scene) && !IsFeedScene(scene) &&
			    main->GetCurrentSceneSource() != scene.Get()) {
				main->SetCurrentScene(scene.Get(), true);
			}
		}
		const QString kind = message.value("spec").toObject().value("kind").toString();
		SetLiveVideo(kind == "blank" ? "clear" : kind == "black" ? "black" : "slide");
		SendToOutput(lastShow);

	} else if (type == "pick-file") {
		const QString kind = message.value("kind").toString();
		const QString requestId = message.value("requestId").toString();
		QString filter;
		QString title;
		if (kind == "ppt") {
			title = QTStr("Church.Pick.Ppt");
			filter = QTStr("Church.Pick.PptFilter") + " (*.pptx)";
		} else if (kind == "image") {
			title = QTStr("Church.Pick.Image");
			filter = QTStr("Church.Pick.ImageFilter") + " (*.png *.jpg *.jpeg *.gif *.bmp *.webp)";
		} else {
			title = QTStr("Church.Pick.Video");
			filter = QTStr("Church.Pick.VideoFilter") + " (*.mp4 *.webm *.m4v *.mov *.ogg)";
		}
		config_t *config = App()->GetUserConfig();
		const char *lastDir = config_get_string(config, CONFIG_SECTION, "LastFileDir");
		QString path = QFileDialog::getOpenFileName(main, title, lastDir ? QT_UTF8(lastDir) : QString(),
							    filter + ";;" + QTStr("Church.Pick.All") + " (*.*)");
		if (!path.isEmpty()) {
			config_set_string(config, CONFIG_SECTION, "LastFileDir",
					  QT_TO_UTF8(QFileInfo(path).absolutePath()));
		}
		SendToPanel({{"type", "file-picked"},
			     {"requestId", requestId},
			     {"path", path.isEmpty() ? QJsonValue::Null : QJsonValue(QDir::fromNativeSeparators(path))}});
	}
}

void ChurchMode::OutputHostMessage(void *data, calldata_t *params)
{
	ChurchMode *mode = static_cast<ChurchMode *>(data);
	const char *json = calldata_string(params, "json");
	QMetaObject::invokeMethod(mode, "OutputMessage", Qt::QueuedConnection, Q_ARG(QString, QT_UTF8(json ? json : "")));
}

void ChurchMode::OutputMessage(const QString &json)
{
	const QJsonObject message = QJsonDocument::fromJson(json.toUtf8()).object();
	if (message.value("type").toString() == "output-ready" && !lastShow.isEmpty()) {
		SendToOutput(lastShow);
	}
}

void ChurchMode::Nav(int delta)
{
	/* The panel saw the same key press itself. */
	if (panelFocused && QApplication::activeWindow()) {
		return;
	}
	SendToPanel({{"type", "nav"}, {"delta", delta > 0 ? 1 : -1}});
}

void ChurchMode::Clear(const QString &what)
{
	if (panelFocused && QApplication::activeWindow()) {
		return;
	}
	SendToPanel({{"type", "clear"}, {"what", what}});
}

/* ---------------------------- hotkeys ----------------------------------- */

void ChurchMode::RegisterHotkeys()
{
	config_t *profile = main->activeConfiguration;

	auto make = [&](const char *name, const char *description, obs_key_t defaultKey) {
		obs_hotkey_id id = obs_hotkey_register_frontend(name, Str(description), ChurchMode::HotkeyPressed, this);

		const char *saved = profile ? config_get_string(profile, "Hotkeys", name) : nullptr;
		OBSDataAutoRelease data = saved ? obs_data_create_from_json(saved) : nullptr;
		if (data) {
			OBSDataArrayAutoRelease bindings = obs_data_get_array(data, "bindings");
			obs_hotkey_load(id, bindings);
		} else if (defaultKey != OBS_KEY_NONE) {
			/* USB presenters send PageDown / PageUp. */
			OBSDataArrayAutoRelease bindings = obs_data_array_create();
			OBSDataAutoRelease binding = obs_data_create();
			obs_data_set_string(binding, "key", obs_key_to_name(defaultKey));
			obs_data_array_push_back(bindings, binding);
			obs_hotkey_load(id, bindings);
		}
		return id;
	};

	nextHotkey = make("Church.NextSlide", "Church.Hotkey.Next", OBS_KEY_PAGEDOWN);
	prevHotkey = make("Church.PreviousSlide", "Church.Hotkey.Previous", OBS_KEY_PAGEUP);
	blankHotkey = make("Church.Blank", "Church.Hotkey.Blank", OBS_KEY_NONE);
	clearHotkey = make("Church.ClearText", "Church.Hotkey.ClearText", OBS_KEY_NONE);
}

void ChurchMode::UnregisterHotkeys()
{
	if (!obs_initialized()) {
		return;
	}
	for (obs_hotkey_id *id : {&nextHotkey, &prevHotkey, &blankHotkey, &clearHotkey}) {
		if (*id != OBS_INVALID_HOTKEY_ID) {
			obs_hotkey_unregister(*id);
			*id = OBS_INVALID_HOTKEY_ID;
		}
	}
}

void ChurchMode::HotkeyPressed(void *data, obs_hotkey_id id, obs_hotkey_t *, bool pressed)
{
	if (!pressed) {
		return;
	}
	ChurchMode *mode = static_cast<ChurchMode *>(data);
	if (id == mode->nextHotkey) {
		QMetaObject::invokeMethod(mode, "Nav", Qt::QueuedConnection, Q_ARG(int, 1));
	} else if (id == mode->prevHotkey) {
		QMetaObject::invokeMethod(mode, "Nav", Qt::QueuedConnection, Q_ARG(int, -1));
	} else if (id == mode->blankHotkey) {
		QMetaObject::invokeMethod(mode, "Clear", Qt::QueuedConnection, Q_ARG(QString, QStringLiteral("all")));
	} else if (id == mode->clearHotkey) {
		QMetaObject::invokeMethod(mode, "Clear", Qt::QueuedConnection, Q_ARG(QString, QStringLiteral("text")));
	}
}

/* ---------------------------- frontend events --------------------------- */

void ChurchMode::FrontendEvent(enum obs_frontend_event event, void *data)
{
	ChurchMode *mode = static_cast<ChurchMode *>(data);

	switch (event) {
	case OBS_FRONTEND_EVENT_SCENE_COLLECTION_CLEANUP:
		for (size_t i = 0; i < FEEDS; i++) {
			if (mode->pickerViews[i]) {
				mode->pickerViews[i]->SetSource(nullptr);
			}
		}
		if (mode->columnCamera) {
			mode->columnCamera->SetSource(nullptr);
		}
		if (mode->columnPip) {
			mode->columnPip->SetSource(nullptr);
		}
		ChurchSlides::SetLive({});
		mode->contentScene = nullptr;
		break;
	case OBS_FRONTEND_EVENT_SCENE_COLLECTION_CHANGED:
		mode->EnsureScenes();
		mode->EnsureLiveGroups();
		mode->SetContent(mode->CurrentContent());
		mode->BindViews();
		mode->HideFeedScenes();
		mode->UpdateLive();
		mode->QueueMixerRefresh();
		break;
	case OBS_FRONTEND_EVENT_SCENE_LIST_CHANGED:
		mode->EnsureLiveGroups();
		mode->HideFeedScenes();
		mode->BindViews();
		mode->UpdateLive();
		mode->QueueMixerRefresh();
		mode->RefreshDeck();
		break;
	case OBS_FRONTEND_EVENT_PREVIEW_SCENE_CHANGED:
	case OBS_FRONTEND_EVENT_SCENE_CHANGED: {
		OBSSource current = mode->main->GetCurrentSceneSource();
		if (mode->IsFeedScene(current)) {
			/* The feeds are not edited on the main screen: back to the content. */
			OBSSource content = mode->CurrentContent();
			if (content) {
				QTimer::singleShot(0, mode, [mode, content]() { mode->main->SetCurrentScene(content, true); });
			}
		} else if (current) {
			mode->SetContent(current);
		}
		mode->UpdateLive();
		break;
	}
	case OBS_FRONTEND_EVENT_STUDIO_MODE_ENABLED:
	case OBS_FRONTEND_EVENT_TRANSITION_STOPPED:
		mode->UpdateLive();
		break;
	case OBS_FRONTEND_EVENT_EXIT: {
		obs_frontend_remove_event_callback(ChurchMode::FrontendEvent, mode);
		if (mode->output) {
			config_t *config = App()->GetUserConfig();
			config_set_double(config, CONFIG_SECTION, "SlidesVolume", obs_source_get_volume(mode->output));
			config_set_double(config, CONFIG_SECTION, "SlidesOutputVolume",
					  obs_source_get_output_volume(mode->output));
			config_set_bool(config, CONFIG_SECTION, "SlidesOutputMuted",
					obs_source_output_muted(mode->output));
			config_set_bool(config, CONFIG_SECTION, "SlidesMonitor",
					obs_source_get_monitoring_enabled(mode->output));
		}
		mode->outputSignal.Disconnect();
		mode->mixerSignals.clear();
		mode->UnregisterHotkeys();
		ChurchSlides::SetOutput(nullptr);
		if (mode->output) {
			obs_source_dec_active(mode->output);
			obs_source_dec_showing(mode->output);
		}
		mode->output = nullptr;
		break;
	}
	default:
		break;
	}
}
