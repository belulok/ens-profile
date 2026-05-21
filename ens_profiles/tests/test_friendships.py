import json

from django.test import TestCase

from ens_profiles.models import Friendship
from ens_profiles.services.friendships import (
    FriendshipError,
    Pair,
    add_friendship,
    bulk_add_friendships,
    friendships_among,
    remove_friendship,
)


class PairCanonicalTests(TestCase):
    def test_orders_alphabetically(self):
        p = Pair.canonical("nick.eth", "vitalik.eth")
        self.assertEqual(p.a, "nick.eth")
        self.assertEqual(p.b, "vitalik.eth")

    def test_normalizes_case_and_whitespace(self):
        p = Pair.canonical("  VITALIK.ETH ", "Nick.Eth")
        self.assertEqual(p.a, "nick.eth")
        self.assertEqual(p.b, "vitalik.eth")

    def test_rejects_invalid_name(self):
        with self.assertRaises(FriendshipError):
            Pair.canonical("foo.com", "bar.eth")

    def test_rejects_self_friendship(self):
        with self.assertRaises(FriendshipError):
            Pair.canonical("vitalik.eth", "vitalik.eth")


class AddRemoveFriendshipTests(TestCase):
    def test_add_creates_canonical_row(self):
        row, created = add_friendship("vitalik.eth", "nick.eth")
        self.assertTrue(created)
        self.assertEqual(row.name_a, "nick.eth")
        self.assertEqual(row.name_b, "vitalik.eth")

    def test_add_is_idempotent(self):
        add_friendship("vitalik.eth", "nick.eth")
        row, created = add_friendship("nick.eth", "vitalik.eth")  # reversed
        self.assertFalse(created)
        self.assertEqual(Friendship.objects.count(), 1)

    def test_remove_existing(self):
        add_friendship("vitalik.eth", "nick.eth")
        n = remove_friendship("vitalik.eth", "nick.eth")
        self.assertEqual(n, 1)
        self.assertEqual(Friendship.objects.count(), 0)

    def test_remove_nonexistent_returns_zero(self):
        n = remove_friendship("vitalik.eth", "nick.eth")
        self.assertEqual(n, 0)

    def test_remove_with_reversed_order_works(self):
        add_friendship("vitalik.eth", "nick.eth")
        n = remove_friendship("nick.eth", "vitalik.eth")
        self.assertEqual(n, 1)


class FriendshipsAmongTests(TestCase):
    def setUp(self):
        add_friendship("vitalik.eth", "nick.eth")
        add_friendship("nick.eth", "ens.eth")
        add_friendship("brantly.eth", "ens.eth")

    def test_returns_only_friendships_within_set(self):
        pairs = friendships_among(["vitalik.eth", "nick.eth"])
        self.assertEqual(pairs, [("nick.eth", "vitalik.eth")])

    def test_filters_out_dangling_endpoints(self):
        pairs = friendships_among(["vitalik.eth"])
        self.assertEqual(pairs, [])

    def test_returns_all_for_full_set(self):
        pairs = friendships_among(["vitalik.eth", "nick.eth", "ens.eth", "brantly.eth"])
        self.assertEqual(len(pairs), 3)

    def test_ignores_invalid_names(self):
        pairs = friendships_among(["foo.com", "<script>.eth"])
        self.assertEqual(pairs, [])


class BulkAddFriendshipsTests(TestCase):
    def test_inserts_each_unique_pair_once(self):
        count = bulk_add_friendships([
            ("vitalik.eth", "nick.eth"),
            ("nick.eth", "vitalik.eth"),  # same pair, reversed
            ("nick.eth", "ens.eth"),
        ])
        self.assertEqual(count, 2)
        self.assertEqual(Friendship.objects.count(), 2)

    def test_silently_skips_invalid_pairs(self):
        count = bulk_add_friendships([
            ("vitalik.eth", "nick.eth"),
            ("vitalik.eth", "vitalik.eth"),   # self
            ("foo.com", "bar.eth"),            # invalid TLD
        ])
        self.assertEqual(count, 1)


class ApiFriendshipsTests(TestCase):
    def setUp(self):
        # CSRF is enforced by middleware; client.enforce_csrf_checks defaults
        # to False which matches what we want for these unit tests.
        pass

    def test_post_creates(self):
        res = self.client.post(
            "/api/friendships/",
            data=json.dumps({"a": "vitalik.eth", "b": "nick.eth"}),
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 201)
        body = res.json()
        self.assertEqual(body["a"], "nick.eth")
        self.assertEqual(body["b"], "vitalik.eth")
        self.assertTrue(body["created"])

    def test_post_idempotent_returns_200(self):
        add_friendship("vitalik.eth", "nick.eth")
        res = self.client.post(
            "/api/friendships/",
            data=json.dumps({"a": "vitalik.eth", "b": "nick.eth"}),
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 200)
        self.assertFalse(res.json()["created"])

    def test_delete_removes(self):
        add_friendship("vitalik.eth", "nick.eth")
        res = self.client.delete(
            "/api/friendships/",
            data=json.dumps({"a": "vitalik.eth", "b": "nick.eth"}),
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["deleted"], 1)
        self.assertEqual(Friendship.objects.count(), 0)

    def test_invalid_name_returns_400(self):
        res = self.client.post(
            "/api/friendships/",
            data=json.dumps({"a": "foo.com", "b": "bar.eth"}),
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 400)

    def test_self_friendship_returns_400(self):
        res = self.client.post(
            "/api/friendships/",
            data=json.dumps({"a": "vitalik.eth", "b": "vitalik.eth"}),
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 400)

    def test_missing_fields_returns_400(self):
        res = self.client.post(
            "/api/friendships/",
            data=json.dumps({"a": "vitalik.eth"}),
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 400)

    def test_invalid_json_returns_400(self):
        res = self.client.post(
            "/api/friendships/",
            data="not json{",
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 400)

    def test_get_not_allowed(self):
        res = self.client.get("/api/friendships/")
        self.assertEqual(res.status_code, 405)
