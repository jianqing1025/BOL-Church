#include <browser-local-file.hpp>
#include <iostream>
#include <stdexcept>

void require(bool value, const char *message)
{
	if (!value) throw std::runtime_error(message);
}

int main()
{
	try {
		BrowserLocalFile file;
		for (const char *path : {"", "/", "//", "////", "relative.mp4"})
			require(!ParseBrowserLocalFile(path, file), "Empty/root/relative paths must be rejected without throwing");
		require(ParseBrowserLocalFile("/C:/Media/My Video.MP4", file), "Valid Windows media path rejected");
		require(file.filePath == "C:/Media/My Video.MP4", "Filename changed");
		require(file.firstComponent == "C:", "Drive component incorrect");
		require(file.extension == "mp4", "Extension must be case insensitive");
		require(ParseBrowserLocalFile("//home/user/video.webm", file), "Valid POSIX absolute path rejected");
		require(file.filePath == "/home/user/video.webm", "POSIX root lost");
		require(ParseBrowserLocalFile("/C:/folder.name/video", file), "Extensionless file rejected");
		require(file.extension.empty(), "Directory dot must not become a file extension");
		require(ParseBrowserLocalFile("///127.0.0.1/share/video.mp4", file), "IP component must reach the existing IP guard");
		require(file.firstComponent == "127.0.0.1", "IP guard input changed");
		std::cout << "Browser local-file regression checks passed\n";
		return 0;
	} catch (const std::exception &error) {
		std::cerr << error.what() << '\n';
		return 1;
	}
}
