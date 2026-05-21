from django.test import SimpleTestCase

from ens_profiles.services.graph import parse_pairs


class ParsePairsTests(SimpleTestCase):
    def test_simple_comma_pairs(self):
        pairs, malformed = parse_pairs("vitalik.eth, nick.eth")
        self.assertEqual(pairs, [("vitalik.eth", "nick.eth")])
        self.assertEqual(malformed, [])

    def test_space_separator(self):
        pairs, _ = parse_pairs("vitalik.eth nick.eth")
        self.assertEqual(pairs, [("vitalik.eth", "nick.eth")])

    def test_tab_separator(self):
        pairs, _ = parse_pairs("vitalik.eth\tnick.eth")
        self.assertEqual(pairs, [("vitalik.eth", "nick.eth")])

    def test_parens_stripped(self):
        pairs, _ = parse_pairs("(vitalik.eth, nick.eth)")
        self.assertEqual(pairs, [("vitalik.eth", "nick.eth")])

    def test_multiple_lines(self):
        raw = "vitalik.eth, nick.eth\nnick.eth, ens.eth"
        pairs, _ = parse_pairs(raw)
        self.assertEqual(pairs, [("vitalik.eth", "nick.eth"), ("nick.eth", "ens.eth")])

    def test_comments_ignored(self):
        raw = "# header\nvitalik.eth, nick.eth\n# trailing"
        pairs, _ = parse_pairs(raw)
        self.assertEqual(pairs, [("vitalik.eth", "nick.eth")])

    def test_blank_lines_ignored(self):
        pairs, _ = parse_pairs("\n\nvitalik.eth, nick.eth\n\n")
        self.assertEqual(pairs, [("vitalik.eth", "nick.eth")])

    def test_case_normalized_to_lower(self):
        pairs, _ = parse_pairs("VITALIK.ETH, NICK.ETH")
        self.assertEqual(pairs, [("vitalik.eth", "nick.eth")])

    def test_invalid_line_goes_to_malformed(self):
        pairs, malformed = parse_pairs("not_a_pair\nvitalik.eth")
        self.assertEqual(pairs, [])
        self.assertEqual(len(malformed), 2)

    def test_xss_payload_rejected_into_malformed(self):
        attack = "<script>alert(1)</script>.eth, fake.eth"
        _, malformed = parse_pairs(attack)
        self.assertEqual(len(malformed), 1)
        self.assertIn("script", malformed[0])

    def test_non_eth_tld_rejected(self):
        _, malformed = parse_pairs("vitalik.com, nick.org")
        self.assertEqual(len(malformed), 1)

    def test_empty_input(self):
        pairs, malformed = parse_pairs("")
        self.assertEqual(pairs, [])
        self.assertEqual(malformed, [])
