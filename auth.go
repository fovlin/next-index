package main

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"sync"
	"time"
)

const (
	passwordAlphabet   = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	sessionCookieName  = "next_index_session"
	sessionDuration    = 12 * time.Hour
	sessionTokenLength = 32
)

func hashPassword(password string) string {
	sum := sha256.Sum256([]byte(password))

	return hex.EncodeToString(sum[:])
}

func validPasswordHash(encoded string) bool {
	decoded, err := hex.DecodeString(encoded)

	return err == nil && len(decoded) == sha256.Size
}

func verifyPassword(encoded string, password string) bool {
	expected, err := hex.DecodeString(encoded)
	if err != nil || len(expected) != sha256.Size {
		return false
	}

	sum := sha256.Sum256([]byte(password))

	return subtle.ConstantTimeCompare(sum[:], expected) == 1
}

func randomPassword(length int) (string, error) {
	result := make([]byte, length)
	random := make([]byte, length)

	for index := 0; index < length; {
		if _, err := rand.Read(random); err != nil {
			return "", fmt.Errorf("create random password: %w", err)
		}

		for _, value := range random {
			limit := 256 - 256%len(passwordAlphabet)
			if int(value) >= limit {
				continue
			}

			result[index] = passwordAlphabet[int(value)%len(passwordAlphabet)]
			index++

			if index == length {
				break
			}
		}
	}

	return string(result), nil
}

type sessionStore struct {
	mutex    sync.Mutex
	sessions map[string]time.Time
	ttl      time.Duration
}

func newSessionStore(ttl time.Duration) *sessionStore {
	return &sessionStore{
		sessions: make(map[string]time.Time),
		ttl:      ttl,
	}
}

func (store *sessionStore) create() (string, error) {
	token := make([]byte, sessionTokenLength)
	if _, err := rand.Read(token); err != nil {
		return "", fmt.Errorf("create session token: %w", err)
	}

	value := base64.RawURLEncoding.EncodeToString(token)

	store.mutex.Lock()
	defer store.mutex.Unlock()

	now := time.Now()
	for key, expires := range store.sessions {
		if now.After(expires) {
			delete(store.sessions, key)
		}
	}

	store.sessions[value] = now.Add(store.ttl)

	return value, nil
}

func (store *sessionStore) valid(value string) bool {
	if value == "" {
		return false
	}

	store.mutex.Lock()
	defer store.mutex.Unlock()

	expires, ok := store.sessions[value]
	if !ok {
		return false
	}

	if time.Now().After(expires) {
		delete(store.sessions, value)
		return false
	}

	return true
}

func (store *sessionStore) destroy(value string) {
	store.mutex.Lock()
	defer store.mutex.Unlock()

	delete(store.sessions, value)
}

type loginFailure struct {
	failures int
	blocked  time.Time
}

type loginLimiter struct {
	mutex    sync.Mutex
	failures map[string]*loginFailure
	limit    int
	block    time.Duration
}

func newLoginLimiter(limit int, block time.Duration) *loginLimiter {
	return &loginLimiter{
		failures: make(map[string]*loginFailure),
		limit:    limit,
		block:    block,
	}
}

func (limiter *loginLimiter) allow(key string) bool {
	limiter.mutex.Lock()
	defer limiter.mutex.Unlock()

	failure, ok := limiter.failures[key]
	if !ok {
		return true
	}

	return time.Now().After(failure.blocked)
}

func (limiter *loginLimiter) fail(key string) {
	limiter.mutex.Lock()
	defer limiter.mutex.Unlock()

	failure, ok := limiter.failures[key]
	if !ok {
		failure = &loginFailure{}
		limiter.failures[key] = failure
	}

	failure.failures++
	if failure.failures >= limiter.limit {
		failure.failures = 0
		failure.blocked = time.Now().Add(limiter.block)
	}
}

func (limiter *loginLimiter) reset(key string) {
	limiter.mutex.Lock()
	defer limiter.mutex.Unlock()

	delete(limiter.failures, key)
}
