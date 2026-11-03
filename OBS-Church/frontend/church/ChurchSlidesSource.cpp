/******************************************************************************
    OBS Church — the "Church Slides" source.

    Every item is a source in a scene, so it shows in the Sources list, can be
    moved, hidden and resized like any other, and saves with the collection.
    The slides themselves are drawn by one browser page (church-presenter's
    output.html); the item that is live draws that page and passes on its sound,
    the others draw nothing — so a video plays once, wherever its item is.

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 2 of the License, or
    (at your option) any later version.
******************************************************************************/

#include "ChurchSlidesSource.hpp"

#include <OBSApp.hpp>

#include <cstring>
#include <mutex>

namespace {

std::mutex lock;
OBSWeakSource output;
OBSWeakSource captionOutput;
std::string liveUuid;
std::function<void(const std::string &)> editHandler;

struct Slides {
	obs_source_t *source;
};

OBSSource Output()
{
	std::lock_guard<std::mutex> guard(lock);
	return OBSGetStrongRef(output);
}

bool IsLive(obs_source_t *source)
{
	std::lock_guard<std::mutex> guard(lock);
	return !liveUuid.empty() && liveUuid == obs_source_get_uuid(source);
}

const char *GetName(void *)
{
	return Str("Church.Source.Slides");
}

void *Create(obs_data_t *, obs_source_t *source)
{
	return new Slides{source};
}

void Destroy(void *data)
{
	delete static_cast<Slides *>(data);
}

uint32_t Width(void *)
{
	obs_video_info ovi;
	return obs_get_video_info(&ovi) ? ovi.base_width : 1920;
}

uint32_t Height(void *)
{
	obs_video_info ovi;
	return obs_get_video_info(&ovi) ? ovi.base_height : 1080;
}

void Render(void *data, gs_effect_t *)
{
	Slides *slides = static_cast<Slides *>(data);

	if (!IsLive(slides->source)) {
		return;
	}
	OBSSource page = Output();
	if (page) {
		obs_source_video_render(page);
	}
}

void EnumSources(void *data, obs_source_enum_proc_t callback, void *param)
{
	Slides *slides = static_cast<Slides *>(data);
	OBSSource page = Output();
	if (page) {
		callback(slides->source, page, param);
	}
}

/* The page's sound, only from the live item (the way a transition passes on its scene's). */
bool AudioRender(void *data, uint64_t *ts_out, struct obs_source_audio_mix *audio, uint32_t mixers, size_t channels,
		 size_t)
{
	Slides *slides = static_cast<Slides *>(data);
	if (!IsLive(slides->source)) {
		return false;
	}
	OBSSource page = Output();
	if (!page || obs_source_audio_pending(page)) {
		return false;
	}
	uint64_t ts = obs_source_get_audio_timestamp(page);
	if (!ts) {
		return false;
	}

	struct obs_source_audio_mix child;
	obs_source_get_audio_mix(page, &child);
	for (size_t mix = 0; mix < MAX_AUDIO_MIXES; mix++) {
		if ((mixers & (1 << mix)) == 0) {
			continue;
		}
		for (size_t ch = 0; ch < channels; ch++) {
			memcpy(audio->output[mix].data[ch], child.output[mix].data[ch], AUDIO_OUTPUT_FRAMES * sizeof(float));
		}
	}
	*ts_out = ts;
	return true;
}

/* "Church Caption": the slide's text, centred at the bottom, over whatever is beneath. */
const char *CaptionName(void *)
{
	return Str("Church.Source.Caption");
}

void *CaptionCreate(obs_data_t *, obs_source_t *source)
{
	return new Slides{source};
}

void CaptionRender(void *, gs_effect_t *)
{
	OBSSource page;
	{
		std::lock_guard<std::mutex> guard(lock);
		page = OBSGetStrongRef(captionOutput);
	}
	if (page) {
		obs_source_video_render(page);
	}
}

bool EditClicked(obs_properties_t *, obs_property_t *, void *data)
{
	Slides *slides = static_cast<Slides *>(data);
	std::function<void(const std::string &)> handler;
	{
		std::lock_guard<std::mutex> guard(lock);
		handler = editHandler;
	}
	if (handler) {
		handler(obs_source_get_uuid(slides->source));
	}
	return false;
}

obs_properties_t *Properties(void *data)
{
	obs_properties_t *props = obs_properties_create();
	obs_properties_add_text(props, "note", Str("Church.Source.SlidesNote"), OBS_TEXT_INFO);
	obs_properties_add_button2(props, "edit", Str("Church.Source.Edit"), EditClicked, data);
	return props;
}

} // namespace

namespace ChurchSlides {

void Register()
{
	obs_source_info info = {};
	info.id = CHURCH_SLIDES_ID;
	info.type = OBS_SOURCE_TYPE_INPUT;
	/* Composite (like a scene): it passes on its child's sound through audio_render — libobs refuses
	 * the OBS_SOURCE_AUDIO flag on composites, and without it the items stay out of the mixers too. */
	/* Custom draw: the page draws itself with its own effect (no default pass around it). */
	info.output_flags = OBS_SOURCE_VIDEO | OBS_SOURCE_CUSTOM_DRAW | OBS_SOURCE_COMPOSITE | OBS_SOURCE_DO_NOT_DUPLICATE;
	info.get_name = GetName;
	info.create = Create;
	info.destroy = Destroy;
	info.get_width = Width;
	info.get_height = Height;
	info.video_render = Render;
	info.enum_active_sources = EnumSources;
	info.enum_all_sources = EnumSources;
	info.audio_render = AudioRender;
	info.get_properties = Properties;
	info.icon_type = OBS_ICON_TYPE_SLIDESHOW;
	obs_register_source(&info);

	obs_source_info caption = {};
	caption.id = CHURCH_CAPTION_ID;
	caption.type = OBS_SOURCE_TYPE_INPUT;
	caption.output_flags = OBS_SOURCE_VIDEO | OBS_SOURCE_CUSTOM_DRAW | OBS_SOURCE_DO_NOT_DUPLICATE;
	caption.get_name = CaptionName;
	caption.create = CaptionCreate;
	caption.destroy = Destroy;
	caption.get_width = Width;
	caption.get_height = Height;
	caption.video_render = CaptionRender;
	caption.icon_type = OBS_ICON_TYPE_TEXT;
	obs_register_source(&caption);
}

void SetCaptionOutput(obs_source_t *source)
{
	std::lock_guard<std::mutex> guard(lock);
	if (source) {
		captionOutput = OBSGetWeakRef(source);
	} else {
		captionOutput = nullptr;
	}
}

void SetOutput(obs_source_t *source)
{
	std::lock_guard<std::mutex> guard(lock);
	if (source) {
		output = OBSGetWeakRef(source);
	} else {
		output = nullptr;
	}
}

void SetLive(const std::string &uuid)
{
	std::lock_guard<std::mutex> guard(lock);
	liveUuid = uuid;
}

std::string Live()
{
	std::lock_guard<std::mutex> guard(lock);
	return liveUuid;
}

void SetEditHandler(std::function<void(const std::string &uuid)> handler)
{
	std::lock_guard<std::mutex> guard(lock);
	editHandler = std::move(handler);
}

bool Is(obs_source_t *source)
{
	return source && strcmp(obs_source_get_unversioned_id(source), CHURCH_SLIDES_ID) == 0;
}

} // namespace ChurchSlides
