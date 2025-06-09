from spellchecker import SpellChecker

def check_part_in_word(part, word):
    spell = SpellChecker()
    if part in word:
        if word in spell:
            return True
        else:
            return False
    else:
        return False
