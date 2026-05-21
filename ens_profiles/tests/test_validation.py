from django.test import SimpleTestCase

from ens_profiles.services.ens import is_valid_ens_name


class IsValidEnsNameTests(SimpleTestCase):
    def test_valid_eth_names(self):
        for name in ["vitalik.eth", "a.eth", "sub.vitalik.eth", "long-name.eth", "name_with_underscore.eth", "VITALIK.ETH"]:
            with self.subTest(name=name):
                self.assertTrue(is_valid_ens_name(name), f"{name!r} should be valid")

    def test_rejects_non_eth_tld(self):
        for name in ["vitalik.com", "mickey.cb.id", "foo.bar", "favicon.ico"]:
            with self.subTest(name=name):
                self.assertFalse(is_valid_ens_name(name), f"{name!r} should be rejected (non-.eth)")

    def test_rejects_malformed(self):
        for name in ["", "vitalik", ".eth", "vitalik.eth.", "vitalik..eth", "vitalik eth"]:
            with self.subTest(name=name):
                self.assertFalse(is_valid_ens_name(name))

    def test_rejects_xss_payloads(self):
        attacks = [
            "<script>alert(1)</script>.eth",
            "</script>.eth",
            "'; drop table profile; --.eth",
            'a"onerror=alert(1).eth',
        ]
        for attack in attacks:
            with self.subTest(attack=attack):
                self.assertFalse(is_valid_ens_name(attack))

    def test_rejects_too_long(self):
        self.assertFalse(is_valid_ens_name("a" * 250 + ".eth"))

    def test_handles_none(self):
        self.assertFalse(is_valid_ens_name(None))
