/******************************************************************************
    OBS Church — a small live view of one scene, and a titled screen around it.

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 2 of the License, or
    (at your option) any later version.
******************************************************************************/

#pragma once

#include <widgets/OBSQTDisplay.hpp>

#include <QFrame>
#include <QPointer>

#include <atomic>
#include <mutex>

class QLabel;
class QToolButton;

/* Draws one scene. In layout mode its framed items (the picture-in-picture
 * camera and slides) can be dragged, resized from the corner, or scaled with
 * the mouse wheel, right there in the small view. */
class ChurchSceneDisplay : public OBSQTDisplay {
	Q_OBJECT

	std::mutex lock;
	OBSWeakSource weak;

	/* Where the scene was last drawn, for turning mouse positions into canvas positions. */
	std::atomic<int> viewX{0}, viewY{0};
	std::atomic<float> viewScale{1.0f};

	std::atomic<bool> editing{false};
	OBSSceneItem dragItem;
	bool dragResize = false;
	float dragOffsetX = 0.0f, dragOffsetY = 0.0f;

	static void Render(void *data, uint32_t cx, uint32_t cy);
	bool ToCanvas(const QPointF &pos, float &x, float &y) const;
	OBSSceneItem ItemAt(float x, float y, bool &corner);

protected:
	void mousePressEvent(QMouseEvent *event) override;
	void mouseMoveEvent(QMouseEvent *event) override;
	void mouseReleaseEvent(QMouseEvent *event) override;
	void mouseDoubleClickEvent(QMouseEvent *event) override;
	void wheelEvent(QWheelEvent *event) override;

signals:
	void clicked();
	void doubleClicked();
	/* A layout drag finished: worth saving. */
	void layoutChanged();

public:
	explicit ChurchSceneDisplay(QWidget *parent = nullptr);
	~ChurchSceneDisplay();

	void SetSource(obs_source_t *source);
	OBSSource GetSource();

	void SetEditing(bool editing);
	bool IsEditing() const { return editing; }
};

/* A titled screen: a header (name, "Live", an optional Project ▾) above a scene, framed in red when it is live. */
class ChurchScreen : public QFrame {
	Q_OBJECT

	QLabel *title;
	QLabel *liveBadge;
	QToolButton *projectButton;
	QFrame *box;
	bool live = false;
	QString note;

public:
	/* `content`: a ChurchSceneDisplay, or any widget (the editable preview). */
	ChurchScreen(const QString &name, QWidget *content, QWidget *parent = nullptr, bool compact = false);

	void SetLive(bool live);
	void SetTitle(const QString &name);
	void SetNote(const QString &note);
	QToolButton *ProjectButton() const { return projectButton; }
};
