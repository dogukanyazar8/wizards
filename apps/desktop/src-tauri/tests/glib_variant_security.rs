//! Exercise the real GLib FFI out-pointer in optimized builds (RUSTSEC-2024-0429).
#![cfg(target_os = "linux")]

use glib::{prelude::*, Variant};

#[test]
fn string_variant_iterator_preserves_values_in_both_directions() {
    let values = ["", "Türkçe", "🦀", "last"];
    let variant = Variant::array_from_iter::<String>(values.map(|value| value.to_variant()));
    assert_eq!(
        variant.array_iter_str().unwrap().collect::<Vec<_>>(),
        values
    );
    assert_eq!(
        variant.array_iter_str().unwrap().rev().collect::<Vec<_>>(),
        values.into_iter().rev().collect::<Vec<_>>()
    );
    assert_eq!(variant.array_iter_str().unwrap().last(), Some("last"));

    let mut iter = variant.array_iter_str().unwrap();
    assert_eq!(iter.nth(1), Some("Türkçe"));
    assert_eq!(iter.nth_back(1), Some("🦀"));
    assert_eq!(iter.next(), None);
    assert_eq!(iter.next_back(), None);
}

#[test]
fn empty_string_variant_iterator_remains_empty() {
    let variant = Variant::array_from_iter::<String>([]);
    let mut iter = variant.array_iter_str().unwrap();
    assert_eq!(iter.next(), None);
    assert_eq!(iter.next_back(), None);
    assert_eq!(iter.last(), None);
}
