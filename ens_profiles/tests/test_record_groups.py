from django.test import SimpleTestCase

from ens_profiles.views import _record_groups


class RecordGroupsTests(SimpleTestCase):
    def test_empty_dict(self):
        groups = _record_groups({})
        self.assertEqual(groups, {"identity": [], "contact": [], "social": [], "other": []})

    def test_identity_grouping(self):
        records = {"description": "hi", "location": "earth", "avatar": "x"}
        groups = _record_groups(records)
        self.assertEqual(groups["identity"], [("description", "hi"), ("location", "earth")])
        # Avatar is intentionally grouped out (rendered separately as the image).
        self.assertEqual(groups["other"], [])

    def test_social_grouping(self):
        records = {"com.twitter": "vbuterin", "com.github": "vbuterin"}
        groups = _record_groups(records)
        names = [k for k, _ in groups["social"]]
        self.assertIn("com.twitter", names)
        self.assertIn("com.github", names)

    def test_unknown_keys_go_to_other(self):
        records = {"xyz.experimental": "value", "description": "hi"}
        groups = _record_groups(records)
        self.assertEqual(groups["other"], [("xyz.experimental", "value")])
        self.assertEqual(groups["identity"], [("description", "hi")])

    def test_empty_values_dropped(self):
        records = {"description": "", "location": "earth"}
        groups = _record_groups(records)
        self.assertEqual(groups["identity"], [("location", "earth")])

    def test_identity_ordering_is_stable(self):
        records = {"location": "x", "display": "y", "description": "z"}
        groups = _record_groups(records)
        self.assertEqual(
            [k for k, _ in groups["identity"]],
            ["display", "description", "location"],
        )
