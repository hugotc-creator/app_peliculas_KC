from app import core


def test_clean_converts_na_to_none():
    assert core.clean("N/A") is None
    assert core.clean("") is None
    assert core.clean("x") == "x"


def test_detail_from_omdb_drops_na_and_keeps_field_order():
    detail = core.detail_from_omdb({"imdbID": "tt1", "Title": "M", "Year": "1999", "Poster": "N/A",
                                    "Plot": "p", "Director": "D", "Writer": "N/A", "Genre": "G"})
    assert detail["poster"] is None
    assert [f["label"] for f in detail["fields"]] == ["Año", "Género", "Director"]


def test_pages_and_offsets():
    assert core.pages_for(23) == 3
    assert core.pages_for(0) == 0
    assert core.page_offset("2") == 10
    assert core.normalize_page("abc") == 1
    assert core.normalize_page(-3) == 1


def test_average():
    assert core.average([]) == 0
    assert core.average([1, 2, 3, 4]) == 2.5


def test_star_kinds_rounds_to_halves():
    assert core.star_kinds(0) == ["empty"] * 5
    assert core.star_kinds(2.5) == ["full", "full", "half", "empty", "empty"]
    assert core.star_kinds(3.2) == ["full", "full", "full", "empty", "empty"]
    assert core.star_kinds(3.3) == ["full", "full", "full", "half", "empty"]
    assert core.star_kinds(5) == ["full"] * 5


def test_is_valid_rating():
    assert [core.is_valid_rating(v) for v in (0, 1, 3, 5, 6, 2.5, True, "3")] == [False, True, True, True, False, False, False, False]


def test_make_and_validate_comment():
    assert core.make_comment("  ", " hola ") == {"author": "Anónimo", "text": "hola"}
    assert core.validate_comment(core.make_comment("a", "ok")) == []
    assert len(core.validate_comment(core.make_comment("a", "   "))) == 1
    assert len(core.validate_comment(core.make_comment("y" * 41, "x" * 501))) == 2


def test_import_pages_and_tally():
    assert [core.import_pages(v) for v in ("3", 10, "7", None, "-1")] == [3, 10, 1, 1, 1]
    assert core.tally_import([{"status": "saved"}, {"status": "existing"}, {"status": "saved"}, {"status": "failed"}]) == \
        {"saved": 2, "existing": 1, "failed": 1}
