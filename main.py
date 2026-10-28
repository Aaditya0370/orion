"""ORION FIREGUARD desktop application entry point."""
import sys

try:
    from PySide6.QtWidgets import QApplication
except ImportError:
    sys.stderr.write("PySide6 is required for the desktop interface. Install project requirements first.\n")
    sys.exit(1)

from orion.gui import FireguardWindow


def main():
    app = QApplication(sys.argv)
    app.setApplicationName("ORION FIREGUARD")
    window = FireguardWindow()
    window.show()
    return app.exec()


if __name__ == "__main__":
    sys.exit(main())
