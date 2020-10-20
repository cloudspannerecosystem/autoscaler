# Enable all rules by default
all

# Allow in-line HTML
exclude_rule 'MD033'

# Allow the first line to not be a top level header
exclude_rule 'MD041'
exclude_rule 'MD002'

# Asterisks for unordered lists
rule 'MD004', :style => :asterisk

# Nested lists should be indented with four spaces.
rule 'MD007', :indent => 4

# Allow table and code lines to be longer than 80 chars
rule 'MD013', :code_blocks => false, :tables => false

# Ordered list item prefixes
rule 'MD029', :style => :ordered

# Spaces after list markers
rule 'MD030', :ul_single => 3, :ul_multi => 3, :ol_single => 2, :ol_multi => 2
