module acovia.net/next-index

go 1.27.2

require (
	acovia.net/opt v0.0.0
	acovia.net/record v0.0.0
	golang.org/x/term v0.47.0
)

require golang.org/x/sys v0.49.0 // indirect

replace acovia.net/opt => ./opt

replace acovia.net/record => ./record
