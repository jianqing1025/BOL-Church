/******************************************************************************
 Copyright (C) 2014 by John R. Bradley <jrb@turrettech.com>
 Copyright (C) 2023 by Lain Bailey <lain@obsproject.com>

 This program is free software: you can redistribute it and/or modify
 it under the terms of the GNU General Public License as published by
 the Free Software Foundation, either version 2 of the License, or
 (at your option) any later version.

 This program is distributed in the hope that it will be useful,
 but WITHOUT ANY WARRANTY; without even the implied warranty of
 MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 GNU General Public License for more details.

 You should have received a copy of the GNU General Public License
 along with this program.  If not, see <http://www.gnu.org/licenses/>.
 ******************************************************************************/

#include "browser-scheme.hpp"
#include <util/base.h>

#include <algorithm>
#include <cctype>
#include <cstdlib>
#include <exception>
#include <string>
#include "browser-local-file.hpp"
#include "ip-string.hpp"
#include "wide-string.hpp"
#include <include/wrapper/cef_stream_resource_handler.h>

/* OBS Church: this runs on CEF's IO thread inside OBS — an exception escaping it (e.g. from a
 * malformed path) used to end the whole program. Any failure is now just "not found". */
static CefRefPtr<CefResourceHandler> CreateLocalFileHandler(CefRefPtr<CefBrowser> browser, CefRefPtr<CefRequest> request);

/* OBS Church: a local file with its length known and skipping supported, so CEF answers byte ranges. */
class LocalFileResourceHandler : public CefResourceHandler {
	CefRefPtr<CefStreamReader> stream;
	CefString mimeType;
	int64_t size;
	/* Where a range asked for begins (-1: the whole file). CEF itself skips to it, through Skip(). */
	int64_t rangeStart = -1;

public:
	LocalFileResourceHandler(CefRefPtr<CefStreamReader> stream_, const CefString &mimeType_, int64_t size_)
		: stream(stream_),
		  mimeType(mimeType_),
		  size(size_)
	{
	}

	bool Open(CefRefPtr<CefRequest> request, bool &handle_request, CefRefPtr<CefCallback>) override
	{
		CefRequest::HeaderMap requestHeaders;
		request->GetHeaderMap(requestHeaders);
		for (const auto &header : requestHeaders) {
			std::string name = header.first.ToString();
			std::transform(name.begin(), name.end(), name.begin(), [](unsigned char c) { return (char)tolower(c); });
			const std::string value = header.second.ToString();
			if (name == "range" && value.rfind("bytes=", 0) == 0 && value.size() > 6 &&
			    isdigit((unsigned char)value[6])) {
				rangeStart = strtoll(value.c_str() + 6, nullptr, 10);
			}
		}
		handle_request = true;
		return true;
	}

	void GetResponseHeaders(CefRefPtr<CefResponse> response, int64_t &response_length, CefString &) override
	{
		CefResponse::HeaderMap headers;
		headers.insert({"Accept-Ranges", "bytes"});
		/* Read from the disk every time: the browser's cache keeping pieces of a changing file gives nothing. */
		headers.insert({"Cache-Control", "no-store"});
		response->SetMimeType(mimeType);
		if (rangeStart >= size && size > 0) {
			response->SetStatus(416);
			response->SetStatusText("Range Not Satisfiable");
			headers.insert({"Content-Range", "bytes */" + std::to_string(size)});
			response->SetHeaderMap(headers);
			response_length = 0;
			return;
		}
		if (rangeStart >= 0 && size > 0) {
			/* What follows is the file from rangeStart on (CEF skips there itself): say so. */
			response->SetStatus(206);
			response->SetStatusText("Partial Content");
			headers.insert({"Content-Range", "bytes " + std::to_string(rangeStart) + "-" + std::to_string(size - 1) +
								 "/" + std::to_string(size)});
			response->SetHeaderMap(headers);
			response_length = size - rangeStart;
			return;
		}
		response->SetStatus(200);
		response->SetStatusText("OK");
		response->SetHeaderMap(headers);
		response_length = size;
	}

	bool Skip(int64_t bytes_to_skip, int64_t &bytes_skipped, CefRefPtr<CefResourceSkipCallback>) override
	{
		const int64_t from = stream->Tell();
		const int64_t to = std::min(size, from + bytes_to_skip);
		if (from < 0 || stream->Seek(to, SEEK_SET) != 0) {
			bytes_skipped = -2;
			return false;
		}
		bytes_skipped = to - from;
		return true;
	}

	bool Read(void *data_out, int bytes_to_read, int &bytes_read, CefRefPtr<CefResourceReadCallback>) override
	{
		bytes_read = 0;
		size_t read = 0;
		do {
			read = stream->Read(static_cast<char *>(data_out) + bytes_read, 1, bytes_to_read - bytes_read);
			bytes_read += int(read);
		} while (read != 0 && bytes_read < bytes_to_read);
		return bytes_read > 0;
	}

	void Cancel() override {}

	IMPLEMENT_REFCOUNTING(LocalFileResourceHandler);
};

CefRefPtr<CefResourceHandler> BrowserSchemeHandlerFactory::Create(CefRefPtr<CefBrowser> browser, CefRefPtr<CefFrame>,
								  const CefString &, CefRefPtr<CefRequest> request)
{
	try {
		return CreateLocalFileHandler(browser, request);
	} catch (const std::exception &e) {
		blog(LOG_WARNING, "[obs-browser] local file request failed: %s", e.what());
	} catch (...) {
		blog(LOG_WARNING, "[obs-browser] local file request failed");
	}
	return nullptr;
}

static CefRefPtr<CefResourceHandler> CreateLocalFileHandler(CefRefPtr<CefBrowser> browser, CefRefPtr<CefRequest> request)
{
	if (!browser || !request) {
		return nullptr;
	}

	CefRefPtr<CefFrame> mainFrame = browser->GetMainFrame();
	if (!mainFrame) return nullptr;
	CefString frameURL = mainFrame->GetURL();
	if (!frameURL.empty()) {
		CefURLParts frameParts;
		if (!CefParseURL(frameURL, frameParts)) return nullptr;
		std::string frameOrigin = CefString(&frameParts.origin);
		if (frameOrigin != "http://absolute/") {
			return nullptr;
		}
	}

	CefURLParts parts;
	if (!CefParseURL(request->GetURL(), parts)) return nullptr;

	std::string path = CefString(&parts.path);

	path = CefURIDecode(path, true, cef_uri_unescape_rule_t::UU_SPACES);
	path = CefURIDecode(path, true, cef_uri_unescape_rule_t::UU_URL_SPECIAL_CHARS_EXCEPT_PATH_SEPARATORS);

	BrowserLocalFile file;
	if (!ParseBrowserLocalFile(path, file)) return nullptr;
	std::string fileExtension = file.extension;
	if (fileExtension.compare("woff2") == 0) {
		fileExtension = "woff";
	}

	const std::string &filePath = file.filePath;
	const std::string &checkString = file.firstComponent;

	// An IP address should never be a valid path for CreateForFile normally, but in some cases an OS
	// can resolve one as such. As an extra safeguard, we prevent any IP addresses in the path.
	if (checkForIpv4String(checkString)) {
		return nullptr;
	}

	if (checkForIpv6String(checkString)) {
		return nullptr;
	}

	CefRefPtr<CefStreamReader> stream = CefStreamReader::CreateForFile(filePath);
	if (!stream) {
		return nullptr;
	}

	CefString mimeType = CefGetMimeType(fileExtension);
	if (mimeType.empty()) {
		mimeType = "application/octet-stream";
	}

	/* OBS Church: a file of known length that can be skipped through, so CEF can answer byte ranges
	 * ("Range: bytes=N-") — what a video needs to be moved to a point, to play on after the page
	 * switched away and back, and to load a long file piece by piece. (CefStreamResourceHandler cannot
	 * skip: every range not starting at 0 failed, and a long video stopped half way.) */
	if (stream->Seek(0, SEEK_END) != 0) {
		return new CefStreamResourceHandler(mimeType, stream);
	}
	const int64_t size = stream->Tell();
	stream->Seek(0, SEEK_SET);
	return new LocalFileResourceHandler(stream, mimeType, size);
}
