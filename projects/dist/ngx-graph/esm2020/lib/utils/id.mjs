const cache = {};
/**
 * Generates a short id.
 *
 */
export function id() {
  let newId = ('0000' + ((Math.random() * Math.pow(36, 4)) << 0).toString(36)).slice(-4);
  newId = `a${newId}`;
  // ensure not already used
  if (!cache[newId]) {
    cache[newId] = true;
    return newId;
  }
  return id();
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi9zd2ltbGFuZS9uZ3gtZ3JhcGgvc3JjL2xpYi91dGlscy9pZC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxNQUFNLEtBQUssR0FBRyxFQUFFLENBQUM7QUFFakI7OztHQUdHO0FBQ0gsTUFBTSxVQUFVLEVBQUU7SUFDaEIsSUFBSSxLQUFLLEdBQUcsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBRXZGLEtBQUssR0FBRyxJQUFJLEtBQUssRUFBRSxDQUFDO0lBRXBCLDBCQUEwQjtJQUMxQixJQUFJLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxFQUFFO1FBQ2pCLEtBQUssQ0FBQyxLQUFLLENBQUMsR0FBRyxJQUFJLENBQUM7UUFDcEIsT0FBTyxLQUFLLENBQUM7S0FDZDtJQUVELE9BQU8sRUFBRSxFQUFFLENBQUM7QUFDZCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiY29uc3QgY2FjaGUgPSB7fTtcblxuLyoqXG4gKiBHZW5lcmF0ZXMgYSBzaG9ydCBpZC5cbiAqXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBpZCgpOiBzdHJpbmcge1xuICBsZXQgbmV3SWQgPSAoJzAwMDAnICsgKChNYXRoLnJhbmRvbSgpICogTWF0aC5wb3coMzYsIDQpKSA8PCAwKS50b1N0cmluZygzNikpLnNsaWNlKC00KTtcblxuICBuZXdJZCA9IGBhJHtuZXdJZH1gO1xuXG4gIC8vIGVuc3VyZSBub3QgYWxyZWFkeSB1c2VkXG4gIGlmICghY2FjaGVbbmV3SWRdKSB7XG4gICAgY2FjaGVbbmV3SWRdID0gdHJ1ZTtcbiAgICByZXR1cm4gbmV3SWQ7XG4gIH1cblxuICByZXR1cm4gaWQoKTtcbn1cbiJdfQ==
