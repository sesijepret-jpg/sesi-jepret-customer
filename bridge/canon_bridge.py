"""Local EOS M50 bridge for the SesiJepret camera page.

Run this on the Windows computer physically connected to the camera. The
browser talks only to 127.0.0.1; Canon EDSDK controls the real shutter.
"""

import argparse
import ctypes as C
import json
import os
import time
import uuid
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path


DEFAULT_DLL = r"C:\Program Files\Canon\EOS Webcam Utility Pro\EDSDK.dll"
DEFAULT_ORIGINS = {
    "https://sesi-jepret.vercel.app",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
}
SAVE_TO = 0x0000000B
IMAGE_QUALITY = 0x00000100
EVF_OUTPUT = 0x00000500
OBJECT_EVENT_ALL = 0x00000200
OBJECT_EVENT_TRANSFER = 0x00000208
CAMERA_COMMAND_TAKE_PICTURE = 0


class CameraError(RuntimeError):
    pass


class Capacity(C.Structure):
    _fields_ = [
        ("number_of_free_clusters", C.c_int32),
        ("bytes_per_sector", C.c_int32),
        ("reset", C.c_int32),
    ]


class CanonCamera:
    def __init__(self, dll_path: Path, capture_dir: Path):
        self.capture_dir = capture_dir
        self.capture_dir.mkdir(parents=True, exist_ok=True)
        os.add_dll_directory(str(dll_path.parent))
        self.sdk = C.WinDLL(str(dll_path))
        self.ptr = C.c_void_p
        self.u32 = C.c_uint32
        self._callback_type = C.WINFUNCTYPE(self.u32, self.u32, self.ptr, self.ptr)
        self._bind_functions()
        self.initialized = False
        self.camera = self.ptr()
        self.original_evf = self.u32()
        self.liveview_on = False
        self.pending_capture = None
        self._callback = self._callback_type(self._on_object)

    def _bind(self, name, args):
        fn = getattr(self.sdk, name)
        fn.argtypes = args
        fn.restype = self.u32
        return fn

    def _bind_functions(self):
        p, u = self.ptr, self.u32
        self.initialize = self._bind("EdsInitializeSDK", [])
        self.terminate = self._bind("EdsTerminateSDK", [])
        self.get_camera_list = self._bind("EdsGetCameraList", [C.POINTER(p)])
        self.get_child_count = self._bind("EdsGetChildCount", [p, C.POINTER(C.c_int32)])
        self.get_child_at = self._bind("EdsGetChildAtIndex", [p, C.c_int32, C.POINTER(p)])
        self.open_session = self._bind("EdsOpenSession", [p])
        self.close_session = self._bind("EdsCloseSession", [p])
        self.release = self._bind("EdsRelease", [p])
        self.get_property = self._bind("EdsGetPropertyData", [p, u, C.c_int32, u, p])
        self.set_property = self._bind("EdsSetPropertyData", [p, u, C.c_int32, u, p])
        self.set_capacity = self._bind("EdsSetCapacity", [p, Capacity])
        self.send_command = self._bind("EdsSendCommand", [p, u, C.c_int32])
        self.get_event = self._bind("EdsGetEvent", [])
        self.set_object_handler = self._bind("EdsSetObjectEventHandler", [p, u, self._callback_type, p])
        self.get_item_info = self._bind("EdsGetDirectoryItemInfo", [p, p])
        self.create_file_stream = self._bind("EdsCreateFileStream", [C.c_char_p, u, u, C.POINTER(p)])
        self.download = self._bind("EdsDownload", [p, C.c_uint64, p])
        self.download_complete = self._bind("EdsDownloadComplete", [p])
        self.create_memory_stream = self._bind("EdsCreateMemoryStream", [C.c_uint64, C.POINTER(p)])
        self.create_evf_ref = self._bind("EdsCreateEvfImageRef", [p, C.POINTER(p)])
        self.download_evf = self._bind("EdsDownloadEvfImage", [p, p])
        self.get_pointer = self._bind("EdsGetPointer", [p, C.POINTER(p)])
        self.get_length = self._bind("EdsGetLength", [p, C.POINTER(C.c_uint64)])

    @staticmethod
    def _check(operation, code):
        if code:
            raise CameraError(f"{operation} gagal (Canon EDSDK 0x{code:08X})")

    def connect(self):
        if self.camera.value:
            current = self.u32()
            if self.get_property(self.camera, SAVE_TO, 0, 4, C.byref(current)) == 0:
                return
            self.disconnect()
        if not self.initialized:
            self._check("Inisialisasi SDK", self.initialize())
            self.initialized = True
        camera_list = self.ptr()
        camera = self.ptr()
        try:
            self._check("Daftar kamera", self.get_camera_list(C.byref(camera_list)))
            count = C.c_int32()
            self._check("Jumlah kamera", self.get_child_count(camera_list, C.byref(count)))
            if count.value < 1:
                raise CameraError("EOS M50 belum terdeteksi melalui USB")
            self._check("Pilih kamera", self.get_child_at(camera_list, 0, C.byref(camera)))
            self._check("Buka sesi kamera", self.open_session(camera))
            self.camera = camera
            camera = self.ptr()
            self._check("Event foto", self.set_object_handler(self.camera, OBJECT_EVENT_ALL, self._callback, None))
            self._check("Baca live view", self.get_property(self.camera, EVF_OUTPUT, 0, 4, C.byref(self.original_evf)))
            self._set_liveview(True)
            print("EOS M50 siap: shutter dan live view aktif", flush=True)
        except Exception:
            if self.camera.value:
                self.disconnect()
            raise
        finally:
            if camera.value:
                self.release(camera)
            if camera_list.value:
                self.release(camera_list)

    def _set_liveview(self, enabled):
        value = self.u32(self.original_evf.value | 2 if enabled else self.original_evf.value)
        self._check("Atur live view", self.set_property(self.camera, EVF_OUTPUT, 0, 4, C.byref(value)))
        self.liveview_on = enabled

    def preview(self):
        self.connect()
        if not self.liveview_on:
            self._set_liveview(True)
        for _ in range(8):
            stream = self.ptr()
            evf = self.ptr()
            try:
                self._check("Buat stream", self.create_memory_stream(0, C.byref(stream)))
                self._check("Buat live view", self.create_evf_ref(stream, C.byref(evf)))
                code = self.download_evf(self.camera, evf)
                if code == 0:
                    data_ptr = self.ptr()
                    length = C.c_uint64()
                    self._check("Baca buffer", self.get_pointer(stream, C.byref(data_ptr)))
                    self._check("Baca panjang buffer", self.get_length(stream, C.byref(length)))
                    frame = C.string_at(data_ptr, length.value)
                    if not frame.startswith(b"\xff\xd8"):
                        raise CameraError("Frame live view bukan JPEG")
                    return frame
                if code != 0x0000A102:
                    self._check("Ambil live view", code)
            finally:
                if evf.value:
                    self.release(evf)
                if stream.value:
                    self.release(stream)
            self.get_event()
            time.sleep(0.15)
        raise CameraError("Live view kamera belum siap")

    def _on_object(self, event, item, _context):
        try:
            if event == OBJECT_EVENT_TRANSFER and item and self.pending_capture is not None:
                info = C.create_string_buffer(512)
                self._check("Info file foto", self.get_item_info(item, info))
                size = C.c_uint64.from_buffer(info, 0).value
                original_name = info.raw[20:276].split(b"\0", 1)[0].decode("ascii", "replace")
                suffix = Path(original_name).suffix.upper()
                if suffix not in {".JPG", ".JPEG", ".CR3", ".CR2"}:
                    raise CameraError(f"Format foto tidak dikenal: {original_name}")
                destination = self.capture_dir / f"{self.pending_capture['id']}{suffix}"
                stream = self.ptr()
                try:
                    self._check("Buka file foto", self.create_file_stream(str(destination).encode("mbcs"), 1, 2, C.byref(stream)))
                    self._check("Transfer foto", self.download(item, size, stream))
                    self._check("Selesaikan transfer", self.download_complete(item))
                    self.pending_capture["files"].append(destination)
                    print(f"Foto diterima: {destination.name} ({size} byte)", flush=True)
                finally:
                    if stream.value:
                        self.release(stream)
        except Exception as exc:
            if self.pending_capture is not None:
                self.pending_capture["error"] = str(exc)
        finally:
            if item:
                self.release(item)
        return 0

    def capture(self):
        self.connect()
        capture = {"id": uuid.uuid4().hex, "files": [], "error": None}
        self.pending_capture = capture
        original_save = self.u32()
        original_quality = self.u32()
        save_changed = False
        quality_changed = False
        try:
            self._check("Baca lokasi penyimpanan", self.get_property(self.camera, SAVE_TO, 0, 4, C.byref(original_save)))
            self._check("Baca kualitas foto", self.get_property(self.camera, IMAGE_QUALITY, 0, 4, C.byref(original_quality)))
            if self.liveview_on:
                self._set_liveview(False)
                time.sleep(0.2)
            # Canon M50 JPEG Small 1 is only 2976x1984. Use Large/Fine for
            # booth captures, preserving RAW if the camera is set to RAW+JPEG.
            large_quality = {
                0x00640E13: 0x00640013,  # RAW + S1 Fine -> RAW + L Fine
                0x00640E12: 0x00640013,  # RAW + S1 Normal -> RAW + L Fine
                0x0E13FF0F: 0x0013FF0F,  # S1 Fine -> L Fine
                0x0E12FF0F: 0x0013FF0F,  # S1 Normal -> L Fine
            }.get(original_quality.value)
            if large_quality is not None:
                target_quality = self.u32(large_quality)
                self._check("Atur JPEG Large/Fine", self.set_property(self.camera, IMAGE_QUALITY, 0, 4, C.byref(target_quality)))
                quality_changed = True
                time.sleep(0.1)
            host = self.u32(2)
            self._check("Simpan ke komputer", self.set_property(self.camera, SAVE_TO, 0, 4, C.byref(host)))
            save_changed = True
            self._check("Kapasitas komputer", self.set_capacity(self.camera, Capacity(0x7FFFFFFF, 0x1000, 1)))
            self._check("Jepret kamera", self.send_command(self.camera, CAMERA_COMMAND_TAKE_PICTURE, 0))
            deadline = time.monotonic() + 20
            jpeg_received_at = None
            while time.monotonic() < deadline:
                self._check("Proses event", self.get_event())
                if capture["error"]:
                    raise CameraError(capture["error"])
                jpeg = next((p for p in capture["files"] if p.suffix.upper() in {".JPG", ".JPEG"}), None)
                if jpeg:
                    if jpeg_received_at is None:
                        jpeg_received_at = time.monotonic()
                    if time.monotonic() - jpeg_received_at > 0.75:
                        data = jpeg.read_bytes()
                        if not data.startswith(b"\xff\xd8"):
                            raise CameraError("File hasil kamera bukan JPEG")
                        return data, jpeg.name
                time.sleep(0.1)
            raise CameraError("Kamera tidak mengirim JPEG dalam 20 detik. Aktifkan kualitas JPEG pada kamera.")
        finally:
            self.pending_capture = None
            if save_changed:
                self.set_property(self.camera, SAVE_TO, 0, 4, C.byref(original_save))
            if quality_changed:
                self.set_property(self.camera, IMAGE_QUALITY, 0, 4, C.byref(original_quality))
            try:
                if self.camera.value:
                    self._set_liveview(True)
            except CameraError as exc:
                print(f"Live view belum pulih: {exc}", flush=True)

    def disconnect(self):
        if self.camera.value:
            if self.liveview_on:
                value = self.u32(self.original_evf.value)
                self.set_property(self.camera, EVF_OUTPUT, 0, 4, C.byref(value))
            self.close_session(self.camera)
            self.release(self.camera)
            self.camera = self.ptr()
        self.liveview_on = False
        if self.initialized:
            self.terminate()
            self.initialized = False


class BridgeHandler(BaseHTTPRequestHandler):
    camera = None
    origins = DEFAULT_ORIGINS

    def log_message(self, format, *args):
        if getattr(self, "path", "") == "/capture" or (len(args) > 1 and str(args[1]).startswith(("4", "5"))):
            super().log_message(format, *args)

    def _origin_allowed(self):
        origin = self.headers.get("Origin")
        return not origin or origin in self.origins

    def _send(self, status, content_type, body):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        origin = self.headers.get("Origin")
        if origin in self.origins:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Private-Network", "true")
            self.send_header("Access-Control-Expose-Headers", "X-Canon-Filename")
        self.end_headers()
        self.wfile.write(body)

    def _json(self, status, **payload):
        self._send(status, "application/json; charset=utf-8", json.dumps(payload).encode("utf-8"))

    def do_OPTIONS(self):
        if not self._origin_allowed():
            self._json(403, error="Origin tidak diizinkan")
            return
        self.send_response(204)
        self.send_header("Content-Length", "0")
        self.send_header("Access-Control-Allow-Origin", self.headers.get("Origin", ""))
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "X-SesiJepret-Bridge, Content-Type")
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Vary", "Origin")
        self.end_headers()

    def do_GET(self):
        if not self._origin_allowed():
            self._json(403, error="Origin tidak diizinkan")
            return
        try:
            if self.path == "/health":
                self.camera.connect()
                self._json(200, ready=True, model="Canon EOS M50", source="EDSDK")
            elif self.path == "/preview":
                self._send(200, "image/jpeg", self.camera.preview())
            else:
                self._json(404, error="Endpoint tidak ditemukan")
        except CameraError as exc:
            self._json(503, ready=False, error=str(exc))

    def do_POST(self):
        if not self._origin_allowed() or self.headers.get("X-SesiJepret-Bridge") != "1":
            self._json(403, error="Permintaan tidak diizinkan")
            return
        if self.path != "/capture":
            self._json(404, error="Endpoint tidak ditemukan")
            return
        try:
            data, filename = self.camera.capture()
            self.send_response(200)
            self.send_header("Content-Type", "image/jpeg")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Canon-Filename", filename)
            origin = self.headers.get("Origin")
            if origin in self.origins:
                self.send_header("Access-Control-Allow-Origin", origin)
                self.send_header("Access-Control-Allow-Private-Network", "true")
                self.send_header("Access-Control-Expose-Headers", "X-Canon-Filename")
                self.send_header("Vary", "Origin")
            self.end_headers()
            self.wfile.write(data)
        except CameraError as exc:
            self._json(503, error=str(exc))


def main():
    parser = argparse.ArgumentParser(description="SesiJepret Canon EOS camera bridge")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--dll", type=Path, default=Path(os.environ.get("SESI_JEPRET_EDSDK_DLL", DEFAULT_DLL)))
    parser.add_argument("--origin", action="append", default=[], help="Additional allowed website origin")
    args = parser.parse_args()
    if not args.dll.is_file():
        parser.error(f"EDSDK.dll tidak ditemukan: {args.dll}")
    BridgeHandler.camera = CanonCamera(args.dll, Path(__file__).parent / "captures")
    BridgeHandler.origins = DEFAULT_ORIGINS | set(args.origin)
    server = HTTPServer(("127.0.0.1", args.port), BridgeHandler)
    print(f"SesiJepret camera bridge: http://127.0.0.1:{args.port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        BridgeHandler.camera.disconnect()
        server.server_close()


if __name__ == "__main__":
    main()
