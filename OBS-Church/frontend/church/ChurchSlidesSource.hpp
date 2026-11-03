/******************************************************************************
    OBS Church — the "Church Slides" source: one item of the slide panel
    (text, scripture, image, video or PPT) as an OBS source.

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 2 of the License, or
    (at your option) any later version.
******************************************************************************/

#pragma once

#include <obs.hpp>

#include <functional>
#include <string>

/* The item's settings key: the panel's item, as JSON (without its id, which is the source's UUID). */
#define CHURCH_SLIDES_ID "church_slides"
#define CHURCH_SLIDES_ITEM "item"

namespace ChurchSlides {

/* Before the scene collection loads. */
void Register();

/* The browser page that draws the slide that is on screen (one, shared by every item). */
void SetOutput(obs_source_t *output);

/* The item whose slide is on screen: it alone shows the page (and plays its sound). */
void SetLive(const std::string &uuid);
std::string Live();

/* "Edit…" in an item's properties. */
void SetEditHandler(std::function<void(const std::string &uuid)> handler);

bool Is(obs_source_t *source);

} // namespace ChurchSlides
