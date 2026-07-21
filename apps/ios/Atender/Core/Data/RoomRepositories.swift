import Foundation
import Observation

@MainActor
@Observable
final class RoomRepository {
    @ObservationIgnored private let client: APIClient
    @ObservationIgnored private let cache: QueryClient

    init(client: APIClient, cache: QueryClient) {
        self.client = client
        self.cache = cache
    }

    func rooms(force: Bool = false) async throws -> [RoomSummaryDto] {
        if !force, !cache.isStale(.rooms()), let cached: [RoomSummaryDto] = cache.data(for: .rooms(), as: [RoomSummaryDto].self) {
            return cached
        }
        let response = try await client.send(Endpoints.rooms(), as: RoomsResponse.self)
        cache.setData(response.rooms, for: .rooms())
        return response.rooms
    }

    func room(id: String, force: Bool = false) async throws -> RoomDto {
        if !force, !cache.isStale(.room(id)), let cached: RoomDto = cache.data(for: .room(id), as: RoomDto.self) {
            return cached
        }
        let response = try await client.send(Endpoints.room(id: id), as: RoomResponse.self)
        cache.setData(response.room, for: .room(id))
        return response.room
    }

    func roomMembers(id: String, force: Bool = false) async throws -> [RoomMemberDto] {
        if !force, !cache.isStale(.roomMembers(id)), let cached: [RoomMemberDto] = cache.data(for: .roomMembers(id), as: [RoomMemberDto].self) {
            return cached
        }
        let response = try await client.send(Endpoints.roomMembers(id: id), as: RoomMembersResponse.self)
        cache.setData(response.members, for: .roomMembers(id))
        return response.members
    }

    func roomWeek(id: String, weekStart: String, force: Bool = false) async throws -> RoomWeekDto {
        let key = QueryKey(["rooms", id, "week", weekStart])
        if !force, !cache.isStale(key), let cached: RoomWeekDto = cache.data(for: key, as: RoomWeekDto.self) {
            return cached
        }
        let week = try await client.send(Endpoints.roomWeek(id: id, weekStart: weekStart), as: RoomWeekDto.self)
        cache.setData(week, for: key)
        return week
    }

    func createRoom(_ input: CreateRoomInput) async throws -> RoomDto {
        let response = try await client.send(Endpoints.createRoom(input), as: RoomResponse.self)
        cache.invalidate(prefixes: invalidationTargets(for: .roomCreate))
        return response.room
    }

    func updateRoom(id: String, _ input: UpdateRoomInput) async throws -> RoomDto {
        let response = try await client.send(Endpoints.updateRoom(id: id, input), as: RoomResponse.self)
        cache.invalidate(prefixes: invalidationTargets(for: .roomUpdate(id: id)))
        return response.room
    }

    func joinRoom(inviteCode: String) async throws -> RoomDto {
        let response = try await client.send(Endpoints.joinRoom(inviteCode: inviteCode), as: RoomResponse.self)
        cache.invalidate(prefixes: invalidationTargets(for: .roomJoin(id: response.room.id)))
        return response.room
    }

    func leaveRoom(id: String) async throws {
        try await client.send(Endpoints.leaveRoom(id: id))
        cache.invalidate(prefixes: invalidationTargets(for: .roomLeave(id: id)))
    }

    func deleteRoom(id: String) async throws {
        try await client.send(Endpoints.deleteRoom(id: id))
        cache.invalidate(prefixes: invalidationTargets(for: .roomDelete(id: id)))
    }

    func removeMember(id: String, userId: String) async throws {
        try await client.send(Endpoints.removeRoomMember(id: id, userId: userId))
        cache.invalidate(prefixes: invalidationTargets(for: .roomMemberRemove(id: id)))
    }

    func regenerateInvite(id: String) async throws -> RoomInviteResponse {
        let response = try await client.send(Endpoints.regenerateRoomInvite(id: id), as: RoomInviteResponse.self)
        cache.invalidate(prefixes: [.room(id)])
        return response
    }
}

@MainActor
@Observable
final class RoomEventRepository {
    @ObservationIgnored private let client: APIClient
    @ObservationIgnored private let cache: QueryClient

    init(client: APIClient, cache: QueryClient) {
        self.client = client
        self.cache = cache
    }

    func createRoomEvent(roomId: String, _ input: CreateRoomEventInput) async throws -> RoomEventDto {
        let response = try await client.send(Endpoints.createRoomEvent(id: roomId, input), as: RoomEventResponse.self)
        cache.invalidate(prefixes: invalidationTargets(for: .roomEvent(id: roomId)))
        return response.event
    }

    func updateRoomEvent(roomId: String, eventId: String, _ input: UpdateRoomEventInput) async throws -> RoomEventDto {
        let response = try await client.send(Endpoints.updateRoomEvent(id: roomId, eventId: eventId, input), as: RoomEventResponse.self)
        cache.invalidate(prefixes: invalidationTargets(for: .roomEvent(id: roomId)))
        return response.event
    }

    func deleteRoomEvent(roomId: String, eventId: String, scope: String = "all", originalDate: String? = nil) async throws {
        try await client.send(Endpoints.deleteRoomEvent(id: roomId, eventId: eventId, scope: scope, originalDate: originalDate))
        cache.invalidate(prefixes: invalidationTargets(for: .roomEvent(id: roomId)))
    }
}

@MainActor
@Observable
final class FriendshipRepository {
    @ObservationIgnored private let client: APIClient
    @ObservationIgnored private let cache: QueryClient

    init(client: APIClient, cache: QueryClient) {
        self.client = client
        self.cache = cache
    }

    func friendships(force: Bool = false) async throws -> [FriendshipDto] {
        if !force, !cache.isStale(.friendships()), let cached: [FriendshipDto] = cache.data(for: .friendships(), as: [FriendshipDto].self) {
            return cached
        }
        let response = try await client.send(Endpoints.friendships(), as: FriendshipsResponse.self)
        cache.setData(response.friendships, for: .friendships())
        return response.friendships
    }

    func createFriendship(_ input: CreateFriendshipInput) async throws -> FriendshipDto {
        let response = try await client.send(Endpoints.createFriendship(input), as: FriendshipResponse.self)
        cache.invalidate(prefixes: invalidationTargets(for: .friendshipAdd))
        return response.friendship
    }

    func action(_ action: String, id: String) async throws {
        if action == "delete" {
            try await client.send(Endpoints.deleteFriendship(id: id))
        } else {
            try await client.send(Endpoints.friendshipAction(id: id, action: action))
        }
        cache.invalidate(prefixes: invalidationTargets(for: .friendshipAction))
    }

    func searchUsers(handle: String) async throws -> [UserSearchDto] {
        let response = try await client.send(Endpoints.searchUsers(handle: handle), as: UsersSearchResponse.self)
        cache.setData(response.users, for: .usersSearch())
        return response.users
    }
}

@MainActor
@Observable
final class TemplateRepository {
    @ObservationIgnored private let client: APIClient
    @ObservationIgnored private let cache: QueryClient

    init(client: APIClient, cache: QueryClient) {
        self.client = client
        self.cache = cache
    }

    func templates(_ query: TemplateSearchQuery, force: Bool = false) async throws -> [TemplateDto] {
        let key = QueryKey(["templates", query.schoolId ?? "", query.departmentId ?? "", query.q ?? "", String(query.limit), query.cursor ?? ""])
        if !force, !cache.isStale(key), let cached: [TemplateDto] = cache.data(for: key, as: [TemplateDto].self) {
            return cached
        }
        let response = try await client.send(Endpoints.templates(query), as: TemplatesResponse.self)
        cache.setData(response.templates, for: key)
        return response.templates
    }

    func copyTemplate(id: String, _ input: TemplateCopyInput) async throws -> UserTimetableDto {
        let response = try await client.send(Endpoints.copyTemplate(id: id, input), as: UserTimetableResponse.self)
        cache.invalidate(prefixes: invalidationTargets(for: .templateCopy))
        return response.userTimetable
    }

    func publishTimetable(id: String, title: String) async throws -> TemplateDto {
        let response = try await client.send(Endpoints.publishAsTemplate(id: id, TemplatePublishInput(title: title)), as: TemplateResponse.self)
        return response.template
    }
}

@MainActor
@Observable
final class IcsImportRepository {
    @ObservationIgnored private let client: APIClient
    @ObservationIgnored private let cache: QueryClient

    init(client: APIClient, cache: QueryClient) {
        self.client = client
        self.cache = cache
    }

    func upload(roomId: String, fileData: Data, filename: String) async throws -> IcsUploadResponse {
        let response = try await client.upload(path: "/api/rooms/\(roomId)/ics-imports", fileData: fileData, filename: filename, as: IcsUploadResponse.self)
        cache.invalidate(prefixes: invalidationTargets(for: .icsImport(roomId: roomId)))
        return response
    }

    func preview(roomId: String, importId: String, force: Bool = false) async throws -> IcsImportPreview {
        let key = QueryKey(["rooms", roomId, "ics-imports", importId, "preview"])
        if !force, !cache.isStale(key), let cached: IcsImportPreview = cache.data(for: key, as: IcsImportPreview.self) {
            return cached
        }
        let response = try await client.send(Endpoints.icsImportPreview(roomId: roomId, importId: importId), as: IcsImportPreview.self)
        cache.setData(response, for: key)
        return response
    }

    func commit(roomId: String, importId: String) async throws -> IcsImportCommitResult {
        let response = try await client.send(Endpoints.commitIcsImport(roomId: roomId, importId: importId), as: IcsImportCommitResult.self)
        cache.invalidate(prefixes: invalidationTargets(for: .icsImport(roomId: roomId)))
        return response
    }
}
