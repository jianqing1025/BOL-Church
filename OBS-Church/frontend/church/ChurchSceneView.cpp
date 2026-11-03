/******************************************************************************
    OBS Church — a small live view of one scene.

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 2 of the License, or
    (at your option) any later version.
******************************************************************************/

#include "ChurchSceneView.hpp"

#include <OBSApp.hpp>
#include <utility/display-helpers.hpp>

#include <QHBoxLayout>
#include <QLabel>
#include <QMouseEvent>
#include <QToolButton>
#include <QVBoxLayout>
#include <QWheelEvent>

#include <algorithm>
#include <vector>

#include "moc_ChurchSceneView.cpp"

namespace {

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

/* The items laid out with a bounding box (all of OBS Church's layout items are), as canvas rectangles. */
struct Box {
	OBSSceneItem item;
	float x, y, w, h;
};

std::vector<Box> Boxes(obs_scene_t *scene)
{
	std::vector<Box> boxes;
	auto collect = [](obs_scene_t *, obs_sceneitem_t *item, void *param) {
		if (!obs_sceneitem_visible(item) || obs_sceneitem_get_bounds_type(item) == OBS_BOUNDS_NONE) {
			return true;
		}
		vec2 pos, bounds;
		obs_sceneitem_get_pos(item, &pos);
		obs_sceneitem_get_bounds(item, &bounds);
		static_cast<std::vector<Box> *>(param)->push_back({item, pos.x, pos.y, bounds.x, bounds.y});
		return true;
	};
	obs_scene_enum_items(scene, collect, &boxes);
	return boxes;
}

const float HANDLE = 0.035f; /* corner handle, as a share of the canvas width */

} // namespace

ChurchSceneDisplay::ChurchSceneDisplay(QWidget *parent) : OBSQTDisplay(parent)
{
	setSizePolicy(QSizePolicy::Expanding, QSizePolicy::Expanding);
	setMinimumSize(96, 54);
	setCursor(Qt::PointingHandCursor);
	setMouseTracking(false);

	connect(this, &OBSQTDisplay::DisplayCreated, this, [this]() {
		obs_display_set_background_color(GetDisplay(), 0x000000);
		obs_display_add_draw_callback(GetDisplay(), ChurchSceneDisplay::Render, this);
	});
}

ChurchSceneDisplay::~ChurchSceneDisplay()
{
	if (GetDisplay()) {
		obs_display_remove_draw_callback(GetDisplay(), ChurchSceneDisplay::Render, this);
	}
	SetSource(nullptr);
}

void ChurchSceneDisplay::SetSource(obs_source_t *source)
{
	OBSSource old;
	{
		std::lock_guard<std::mutex> guard(lock);
		old = OBSGetStrongRef(weak);
		if (old == source) {
			return;
		}
		if (source) {
			weak = OBSGetWeakRef(source);
		} else {
			weak = nullptr;
		}
	}
	/* Showing keeps the scene's sources (the camera) running while it is on screen here. */
	if (old) {
		obs_source_dec_showing(old);
	}
	if (source) {
		obs_source_inc_showing(source);
	}
}

OBSSource ChurchSceneDisplay::GetSource()
{
	std::lock_guard<std::mutex> guard(lock);
	return OBSGetStrongRef(weak);
}

void ChurchSceneDisplay::SetEditing(bool on)
{
	editing = on;
	dragItem = nullptr;
	setCursor(on ? Qt::SizeAllCursor : Qt::PointingHandCursor);
}

void ChurchSceneDisplay::Render(void *data, uint32_t cx, uint32_t cy)
{
	ChurchSceneDisplay *view = static_cast<ChurchSceneDisplay *>(data);
	OBSSource source = view->GetSource();
	if (!source) {
		return;
	}

	obs_video_info ovi;
	if (!obs_get_video_info(&ovi)) {
		return;
	}

	int x, y;
	float scale;
	GetScaleAndCenterPos(int(ovi.base_width), int(ovi.base_height), int(cx), int(cy), x, y, scale);
	int w = int(scale * float(ovi.base_width));
	int h = int(scale * float(ovi.base_height));
	view->viewX = x;
	view->viewY = y;
	view->viewScale = scale;

	gs_viewport_push();
	gs_projection_push();
	gs_ortho(0.0f, float(ovi.base_width), 0.0f, float(ovi.base_height), -100.0f, 100.0f);
	gs_set_viewport(x, y, w, h);

	obs_source_video_render(source);

	/* Layout mode: a frame and a corner handle on every item that can be moved. */
	obs_scene_t *scene = obs_scene_from_source(source);
	if (view->editing && scene) {
		gs_effect_t *solid = obs_get_base_effect(OBS_EFFECT_SOLID);
		gs_eparam_t *color = gs_effect_get_param_by_name(solid, "color");
		vec4 yellow;
		vec4_set(&yellow, 1.0f, 0.82f, 0.2f, 1.0f);
		gs_effect_set_vec4(color, &yellow);
		float handle = float(ovi.base_width) * HANDLE;
		while (gs_effect_loop(solid, "Solid")) {
			for (const Box &b : Boxes(scene)) {
				for (float inset : {0.0f, 2.0f / scale}) {
					gs_render_start(true);
					gs_vertex2f(b.x + inset, b.y + inset);
					gs_vertex2f(b.x + b.w - inset, b.y + inset);
					gs_vertex2f(b.x + b.w - inset, b.y + b.h - inset);
					gs_vertex2f(b.x + inset, b.y + b.h - inset);
					gs_vertex2f(b.x + inset, b.y + inset);
					gs_render_stop(GS_LINESTRIP);
				}
				gs_render_start(true);
				gs_vertex2f(b.x + b.w - handle, b.y + b.h - handle);
				gs_vertex2f(b.x + b.w, b.y + b.h - handle);
				gs_vertex2f(b.x + b.w - handle, b.y + b.h);
				gs_vertex2f(b.x + b.w, b.y + b.h);
				gs_render_stop(GS_TRISTRIP);
			}
		}
	}

	gs_projection_pop();
	gs_viewport_pop();
}

bool ChurchSceneDisplay::ToCanvas(const QPointF &pos, float &x, float &y) const
{
	float scale = viewScale;
	if (scale <= 0.0f) {
		return false;
	}
	qreal ratio = devicePixelRatioF();
	x = (float(pos.x() * ratio) - float(viewX)) / scale;
	y = (float(pos.y() * ratio) - float(viewY)) / scale;
	return true;
}

OBSSceneItem ChurchSceneDisplay::ItemAt(float x, float y, bool &corner)
{
	corner = false;
	OBSSource source = GetSource();
	obs_scene_t *scene = obs_scene_from_source(source);
	if (!scene) {
		return nullptr;
	}
	float cx, cy;
	Canvas(cx, cy);
	float handle = cx * HANDLE * 1.6f;

	std::vector<Box> boxes = Boxes(scene);
	/* Topmost first: the camera over the slides. */
	for (auto it = boxes.rbegin(); it != boxes.rend(); ++it) {
		const Box &b = *it;
		bool inCorner = x >= b.x + b.w - handle && x <= b.x + b.w + handle * 0.3f && y >= b.y + b.h - handle &&
				y <= b.y + b.h + handle * 0.3f;
		if (inCorner || (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h)) {
			corner = inCorner;
			return b.item;
		}
	}
	return nullptr;
}

void ChurchSceneDisplay::mousePressEvent(QMouseEvent *event)
{
	if (editing && event->button() == Qt::LeftButton) {
		float x, y;
		bool corner;
		if (ToCanvas(event->position(), x, y)) {
			dragItem = ItemAt(x, y, corner);
			dragResize = corner;
			if (dragItem) {
				vec2 pos;
				obs_sceneitem_get_pos(dragItem, &pos);
				dragOffsetX = x - pos.x;
				dragOffsetY = y - pos.y;
			}
		}
		return;
	}
	if (event->button() == Qt::LeftButton) {
		emit clicked();
	}
	OBSQTDisplay::mousePressEvent(event);
}

void ChurchSceneDisplay::mouseMoveEvent(QMouseEvent *event)
{
	if (!editing || !dragItem) {
		OBSQTDisplay::mouseMoveEvent(event);
		return;
	}
	float x, y;
	if (!ToCanvas(event->position(), x, y)) {
		return;
	}
	float cx, cy;
	Canvas(cx, cy);
	vec2 pos, bounds;
	obs_sceneitem_get_pos(dragItem, &pos);
	obs_sceneitem_get_bounds(dragItem, &bounds);

	if (dragResize) {
		/* Keep the shape: width from the mouse, height to match. */
		float aspect = bounds.x > 0.0f ? bounds.y / bounds.x : cy / cx;
		float w = std::clamp(x - pos.x, cx * 0.08f, cx - pos.x);
		vec2_set(&bounds, w, w * aspect);
		obs_sceneitem_set_bounds(dragItem, &bounds);
	} else {
		float nx = std::clamp(x - dragOffsetX, -bounds.x * 0.5f, cx - bounds.x * 0.5f);
		float ny = std::clamp(y - dragOffsetY, -bounds.y * 0.5f, cy - bounds.y * 0.5f);
		vec2_set(&pos, nx, ny);
		obs_sceneitem_set_pos(dragItem, &pos);
	}
}

void ChurchSceneDisplay::mouseReleaseEvent(QMouseEvent *event)
{
	if (editing && dragItem) {
		dragItem = nullptr;
		emit layoutChanged();
		return;
	}
	OBSQTDisplay::mouseReleaseEvent(event);
}

void ChurchSceneDisplay::wheelEvent(QWheelEvent *event)
{
	if (!editing) {
		OBSQTDisplay::wheelEvent(event);
		return;
	}
	float x, y;
	bool corner;
	if (!ToCanvas(event->position(), x, y)) {
		return;
	}
	OBSSceneItem item = ItemAt(x, y, corner);
	if (!item) {
		return;
	}
	/* Grow or shrink around the item's centre. */
	float cx, cy;
	Canvas(cx, cy);
	vec2 pos, bounds;
	obs_sceneitem_get_pos(item, &pos);
	obs_sceneitem_get_bounds(item, &bounds);
	float factor = event->angleDelta().y() > 0 ? 1.05f : 1.0f / 1.05f;
	float w = std::clamp(bounds.x * factor, cx * 0.08f, cx);
	float h = bounds.x > 0.0f ? w * bounds.y / bounds.x : w * cy / cx;
	vec2 center;
	vec2_set(&center, pos.x + bounds.x * 0.5f, pos.y + bounds.y * 0.5f);
	vec2_set(&bounds, w, h);
	vec2_set(&pos, center.x - w * 0.5f, center.y - h * 0.5f);
	obs_sceneitem_set_bounds(item, &bounds);
	obs_sceneitem_set_pos(item, &pos);
	emit layoutChanged();
}

void ChurchSceneDisplay::mouseDoubleClickEvent(QMouseEvent *event)
{
	if (!editing && event->button() == Qt::LeftButton) {
		emit doubleClicked();
	}
	OBSQTDisplay::mouseDoubleClickEvent(event);
}

/* ------------------------------------------------------------------------- */

ChurchScreen::ChurchScreen(const QString &name, QWidget *content, QWidget *parent, bool compact) : QFrame(parent)
{
	setObjectName("churchScreen");

	title = new QLabel(name);
	title->setObjectName("churchScreenTitle");

	liveBadge = new QLabel(QString::fromUtf8("● ") + QTStr("Church.Live"));
	liveBadge->setObjectName("churchLiveBadge");
	liveBadge->setStyleSheet("color: #ff5a4e; font-weight: bold;");
	liveBadge->setVisible(false);

	projectButton = new QToolButton();
	projectButton->setText(QTStr("Church.Project"));
	projectButton->setToolTip(QTStr("Church.Project.Tip"));
	projectButton->setPopupMode(QToolButton::InstantPopup);
	projectButton->setAutoRaise(true);

	QHBoxLayout *head = new QHBoxLayout();
	head->setContentsMargins(2, 0, 2, 0);
	head->setSpacing(6);
	head->addWidget(title);
	head->addWidget(liveBadge);
	head->addStretch(1);
	head->addWidget(projectButton);

	/* The red frame: the box's own background shows around its child. */
	box = new QFrame();
	box->setObjectName("churchScreenBox");
	QVBoxLayout *boxLayout = new QVBoxLayout(box);
	boxLayout->setContentsMargins(3, 3, 3, 3);
	boxLayout->addWidget(content);

	QVBoxLayout *layout = new QVBoxLayout(this);
	layout->setContentsMargins(0, compact ? 0 : 2, 0, 0);
	layout->setSpacing(compact ? 0 : 2);
	layout->addLayout(head);
	layout->addWidget(box, 1);

	SetLive(false);
}

void ChurchScreen::SetLive(bool on)
{
	live = on;
	box->setStyleSheet(live ? "#churchScreenBox { background: #e5484d; border-radius: 3px; }"
				: "#churchScreenBox { background: transparent; }");
	SetNote(note);
}

void ChurchScreen::SetTitle(const QString &name)
{
	title->setText(name);
}

/* A note (e.g. "Editing layout") takes the badge's place; without one the badge shows "Live" when live. */
void ChurchScreen::SetNote(const QString &text)
{
	note = text;
	if (!note.isEmpty()) {
		liveBadge->setText(note);
		liveBadge->setStyleSheet("color: #ffd23a; font-weight: bold;");
		liveBadge->setVisible(true);
	} else {
		liveBadge->setText(QString::fromUtf8("● ") + QTStr("Church.Live"));
		liveBadge->setStyleSheet("color: #ff5a4e; font-weight: bold;");
		liveBadge->setVisible(live);
	}
}
