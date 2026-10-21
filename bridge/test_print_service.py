import unittest
from io import BytesIO

from PIL import Image

from print_service import A5_PX, PrintError, create_a5_page


class A5LayoutTest(unittest.TestCase):
    def test_two_full_strips_fit_on_one_a5(self):
        strip = Image.new("RGB", (600, 1800), "red")
        strip.paste("blue", (0, 900, 600, 1800))
        payload = BytesIO()
        strip.save(payload, format="PNG")

        page = create_a5_page(payload.getvalue())
        self.assertEqual(page.size, A5_PX)
        self.assertEqual(page.getpixel((0, 0)), (255, 255, 255))
        self.assertEqual(page.getpixel((277, 340)), (255, 0, 0))
        self.assertEqual(page.getpixel((877, 340)), (255, 0, 0))
        self.assertEqual(page.getpixel((277, 2139)), (0, 0, 255))
        self.assertEqual(page.getpixel((877, 2139)), (0, 0, 255))
        self.assertEqual(page.getpixel((1753, 2479)), (255, 255, 255))

    def test_wrong_strip_size_is_rejected(self):
        payload = BytesIO()
        Image.new("RGB", (1200, 1800)).save(payload, format="PNG")
        with self.assertRaises(PrintError):
            create_a5_page(payload.getvalue())


if __name__ == "__main__":
    unittest.main()
