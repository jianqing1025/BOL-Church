#pragma once
#include <string>
#include <cctype>

struct BrowserLocalFile {
	std::string filePath;
	std::string firstComponent;
	std::string extension;
};

inline bool ParseBrowserLocalFile(const std::string &path, BrowserLocalFile &file)
{
	file = {};
	if (path.empty() || path.front() != '/') return false;
	const auto first = path.find_first_not_of('/');
	if (first == std::string::npos) return false;
	const auto separator = path.find('/', first);
	file.filePath = path.substr(1);
	file.firstComponent = path.substr(first, separator == std::string::npos ? std::string::npos : separator - first);
	const auto dot = path.find_last_of('.');
	if (dot != std::string::npos && dot > path.find_last_of('/')) {
		file.extension = path.substr(dot + 1);
		for (char &ch : file.extension) ch = static_cast<char>(std::tolower(static_cast<unsigned char>(ch)));
	}
	return true;
}
