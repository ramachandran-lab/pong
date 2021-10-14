from os import path

with open(path.join(path.dirname(__file__), 'VERSION')) as f:
	version = f.read().strip()

__version__ = version
