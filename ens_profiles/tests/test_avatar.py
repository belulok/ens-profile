from django.test import SimpleTestCase

from ens_profiles.services.avatar import normalize_avatar


class NormalizeAvatarTests(SimpleTestCase):
    def test_https_passthrough(self):
        result = normalize_avatar("https://example.com/img.png")
        self.assertEqual(result.kind, "https")
        self.assertEqual(result.url, "https://example.com/img.png")
        self.assertIsNone(result.unrendered_reason)

    def test_http_passthrough(self):
        result = normalize_avatar("http://example.com/img.png")
        self.assertEqual(result.kind, "https")  # bucketed under https for rendering
        self.assertEqual(result.url, "http://example.com/img.png")

    def test_ipfs_rewritten_to_gateway(self):
        result = normalize_avatar("ipfs://QmAbc123/path/to/img.png")
        self.assertEqual(result.kind, "ipfs")
        self.assertEqual(result.url, "https://ipfs.io/ipfs/QmAbc123/path/to/img.png")

    def test_ipfs_leading_slash_handled(self):
        result = normalize_avatar("ipfs:///QmAbc123")
        self.assertEqual(result.url, "https://ipfs.io/ipfs/QmAbc123")

    def test_data_uri_passthrough(self):
        uri = "data:image/png;base64,iVBORw0KGgo="
        result = normalize_avatar(uri)
        self.assertEqual(result.kind, "data")
        self.assertEqual(result.url, uri)

    def test_nft_uri_flagged_not_rendered(self):
        result = normalize_avatar("eip155:1/erc721:0xabc/123")
        self.assertEqual(result.kind, "nft")
        self.assertIsNone(result.url)
        self.assertIsNotNone(result.unrendered_reason)

    def test_unknown_scheme_flagged(self):
        result = normalize_avatar("ftp://example.com/img.png")
        self.assertEqual(result.kind, "unknown")
        self.assertIsNone(result.url)

    def test_empty_input(self):
        for value in [None, "", "   "]:
            with self.subTest(value=value):
                result = normalize_avatar(value)
                # Empty becomes "none"; whitespace-only becomes "unknown".
                self.assertIn(result.kind, ("none", "unknown"))
                self.assertIsNone(result.url)
