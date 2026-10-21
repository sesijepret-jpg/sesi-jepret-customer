import ctypes
import unittest
from unittest.mock import Mock

from canon_bridge import CameraError, CanonCamera


class CameraRecoveryTests(unittest.TestCase):
    def test_disconnected_usb_does_not_reuse_stale_camera_pointer(self):
        camera = CanonCamera.__new__(CanonCamera)
        camera.ptr = ctypes.c_void_p
        camera.camera = ctypes.c_void_p(123)
        camera.liveview_on = True
        camera.initialized = True
        camera.set_property = Mock(side_effect=AssertionError("stale pointer reused"))
        camera.close_session = Mock(side_effect=AssertionError("stale pointer reused"))
        camera.release = Mock(side_effect=AssertionError("stale pointer reused"))
        camera.terminate = Mock(return_value=0)

        camera.disconnect(broken=True)

        self.assertIsNone(camera.camera.value)
        self.assertFalse(camera.liveview_on)
        self.assertFalse(camera.initialized)
        camera.terminate.assert_called_once_with()
        camera.close_session.assert_not_called()

    def test_preview_reopens_session_after_comm_disconnect(self):
        camera = CanonCamera.__new__(CanonCamera)
        camera._preview_frame = Mock(side_effect=[
            CameraError("Ambil live view gagal (Canon EDSDK 0x000000C1)"),
            b"\xff\xd8frame",
        ])
        camera.disconnect = Mock()

        self.assertEqual(camera.preview(), b"\xff\xd8frame")
        camera.disconnect.assert_called_once_with(broken=True)
        self.assertEqual(camera._preview_frame.call_count, 2)


if __name__ == "__main__":
    unittest.main()
